// Genera los íconos PNG de la PWA sin dependencias: un orbe con barras de sonido.
// Uso: npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
const BG = [11, 11, 20];
const VIOLET = [139, 92, 246];
const DEEP = [59, 29, 143];
const TEAL = [34, 211, 166];
const BARS = [0.34, 0.62, 1, 0.62, 0.34]; // alto relativo de cada barra

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** Color (RGBA 0-255) de un punto en coordenadas normalizadas -1..1. */
function sample(x, y, { maskable }) {
  const r = Math.hypot(x, y);
  // Los íconos maskable se recortan: el orbe tiene que caber en el 80 % central.
  const orbR = maskable ? 0.62 : 0.94;
  let color = maskable ? [...BG, 255] : [0, 0, 0, 0];

  if (r <= orbR) {
    const n = r / orbR;
    let c = mix(VIOLET, DEEP, clamp01(n * 0.9));
    const teal = clamp01(1 - Math.hypot(x / orbR - 0.4, y / orbR - 0.6) / 0.9);
    c = mix(c, TEAL, teal * 0.85);
    const shine = clamp01(1 - Math.hypot(x / orbR + 0.4, y / orbR + 0.5) / 0.45);
    c = mix(c, [255, 255, 255], shine * 0.45);
    color = [...c, 255];

    // Barras de sonido blancas, redondeadas.
    const w = orbR * 0.11;
    const gap = orbR * 0.07;
    const total = BARS.length * w + (BARS.length - 1) * gap;
    BARS.forEach((h, i) => {
      const cx = -total / 2 + w / 2 + i * (w + gap);
      const half = (orbR * 0.55 * h) / 2;
      const dy = Math.max(0, Math.abs(y) - (half - w / 2));
      if (Math.hypot(x - cx, dy) <= w / 2) color = [255, 255, 255, 255];
    });
  }
  return color;
}

function render(size, options) {
  const SS = 4; // supersampling para bordes suaves
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
          const [r, g, b, a] = sample(x, y, options);
          acc[0] += r * a;
          acc[1] += g * a;
          acc[2] += b * a;
          acc[3] += a;
        }
      }
      const o = (py * size + px) * 4;
      const alpha = acc[3] / (SS * SS);
      pixels[o] = acc[3] ? Math.round(acc[0] / acc[3]) : 0;
      pixels[o + 1] = acc[3] ? Math.round(acc[1] / acc[3]) : 0;
      pixels[o + 2] = acc[3] ? Math.round(acc[2] / acc[3]) : 0;
      pixels[o + 3] = Math.round(alpha);
    }
  }
  return png(size, pixels);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits por canal
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // sin filtro
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(new URL('icon-192.png', OUT), render(192, { maskable: false }));
writeFileSync(new URL('icon-512.png', OUT), render(512, { maskable: false }));
writeFileSync(new URL('icon-512-maskable.png', OUT), render(512, { maskable: true }));
console.log('Íconos generados en public/icons/');
