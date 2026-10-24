// Fondo animado del tema y ondas alrededor del orbe. Spotify no entrega el audio a la web,
// así que el espectro es simulado: late a un tempo fijo cuando suena y se calma en pausa.
import type { BackdropKind } from './themes';

const BANDS = 40;
const BPM = 118;

type Rgb = [number, number, number];

interface Palette {
  bg: Rgb;
  accent: Rgb;
  accent2: Rgb;
  deep: Rgb;
}

const rgba = ([r, g, b]: Rgb, alpha = 1) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const probe = document.createElement('canvas').getContext('2d')!;

/** Cualquier color CSS → [r, g, b], usando el canvas para interpretarlo. */
function toRgb(color: string, fallback: Rgb): Rgb {
  if (!color) return fallback;
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  const value = String(probe.fillStyle);
  if (value.startsWith('#')) {
    const n = parseInt(value.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const [r, g, b] = value.match(/\d+(\.\d+)?/g)?.map(Number) ?? [];
  return r !== undefined && g !== undefined && b !== undefined ? [r, g, b] : fallback;
}

function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: Rgb) => toRgb(style.getPropertyValue(name).trim(), fallback);
  return {
    bg: get('--bg', [11, 11, 20]),
    accent: get('--accent', [139, 92, 246]),
    accent2: get('--accent-2', [34, 211, 166]),
    deep: get('--accent-deep', [59, 29, 143]),
  };
}

/** Espectro inventado: bombo en graves, caja en medios y platillos en agudos. */
class Spectrum {
  readonly bands = new Float32Array(BANDS);
  /** Golpe de graves del momento, de 0 a 1. */
  bass = 0;
  /** Sube al reproducir y baja al pausar, para que las ondas no aparezcan ni se corten de golpe. */
  energy = 0;
  playing = false;
  private readonly phases = Array.from({ length: BANDS }, () => Math.random() * Math.PI * 2);
  private readonly speeds = Array.from(
    { length: BANDS },
    (_, i) => 1.5 + Math.random() * 2 + i * 0.12,
  );

  update(t: number, dt: number): void {
    const goal = this.playing ? 1 : 0;
    this.energy += (goal - this.energy) * Math.min(1, dt * (this.playing ? 2.5 : 1.5));

    const beat = (t * BPM) / 60;
    const kick = Math.exp(-(beat % 1) * 7);
    const snare = Math.floor(beat) % 2 === 1 ? Math.exp(-(beat % 1) * 9) : 0;
    const hat = Math.exp(-((beat * 2) % 1) * 14);
    // Cambia la intensidad de a ratos para que no suene a metrónomo.
    const groove = 0.75 + 0.25 * Math.sin(t * 0.7);
    this.bass = kick * this.energy * groove;

    for (let i = 0; i < BANDS; i++) {
      const f = i / (BANDS - 1);
      const wobble = 0.5 + 0.5 * Math.sin(t * this.speeds[i]! + this.phases[i]!);
      const low = kick * Math.pow(1 - f, 2.2);
      const mid =
        (0.3 + 0.35 * wobble) * Math.exp(-((f - 0.45) ** 2) / 0.06) +
        snare * 0.5 * Math.exp(-((f - 0.55) ** 2) / 0.04);
      const high =
        hat * Math.pow(f, 1.4) * (0.4 + 0.6 * Math.abs(Math.sin(t * this.speeds[i]! * 3)));
      const music = Math.min(1, this.energy * groove * (low + mid + high * 0.6));
      const idle = 0.05 + 0.03 * Math.sin(t * 1.2 + f * 6);
      const target = Math.max(idle, music);
      const current = this.bands[i]!;
      const rate = target > current ? 30 : 6; // sube rápido, cae lento
      this.bands[i] = current + (target - current) * Math.min(1, dt * rate);
    }
  }
}

class OrbWaves {
  private readonly ctx: CanvasRenderingContext2D;
  private size = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly orb: HTMLElement,
  ) {
    this.ctx = canvas.getContext('2d')!;
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  private resize(): void {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.size = Math.round(this.canvas.clientWidth * dpr);
    this.canvas.width = this.canvas.height = this.size;
  }

  draw(spectrum: Spectrum, palette: Palette): void {
    this.orb.style.setProperty('--kick', spectrum.bass.toFixed(3));
    const { ctx, size } = this;
    if (!size) return;
    ctx.clearRect(0, 0, size, size);

    // Graves abajo, agudos arriba, espejados a izquierda y derecha.
    const c = size / 2;
    const r0 = size * 0.295;
    const maxLen = size * 0.19;
    const inner: [number, number][] = [];
    const outer: [number, number][] = [];
    const angles: number[] = [];
    const lengths: number[] = [];
    for (let i = 0; i < BANDS; i++) {
      angles.push(Math.PI / 2 + ((i + 0.5) / BANDS) * Math.PI);
      lengths.push(maxLen * (0.06 + 0.94 * spectrum.bands[i]!));
    }
    for (let i = BANDS - 1; i >= 0; i--) {
      angles.push(Math.PI / 2 - ((i + 0.5) / BANDS) * Math.PI);
      lengths.push(lengths[i]!);
    }
    angles.forEach((angle, k) => {
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      inner.push([c + cos * r0, c + sin * r0]);
      const r = r0 + lengths[k]!;
      outer.push([c + cos * r, c + sin * r]);
    });

    const gradient = ctx.createConicGradient(Math.PI / 2, c, c);
    gradient.addColorStop(0, rgba(palette.accent));
    gradient.addColorStop(0.5, rgba(palette.accent2));
    gradient.addColorStop(1, rgba(palette.accent));

    // Silueta suave que une las puntas: la «onda».
    const tip = (k: number) => outer[k % outer.length]!;
    ctx.beginPath();
    for (let k = 0; k <= outer.length; k++) {
      const [x, y] = tip(k);
      const [nx, ny] = tip(k + 1);
      if (k === 0) ctx.moveTo((x + nx) / 2, (y + ny) / 2);
      else ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
    }
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.16 + 0.12 * spectrum.bass;
    ctx.fill();

    // Barras: una pasada ancha y tenue (brillo) y otra fina.
    ctx.beginPath();
    inner.forEach(([x, y], k) => {
      ctx.moveTo(x, y);
      const [ox, oy] = tip(k);
      ctx.lineTo(ox, oy);
    });
    const barWidth = ((2 * Math.PI * r0) / angles.length) * 0.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = gradient;
    ctx.lineWidth = barWidth * 2.6;
    ctx.globalAlpha = 0.18;
    ctx.stroke();
    ctx.lineWidth = barWidth;
    ctx.globalAlpha = 0.95;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

interface Star {
  x: number;
  y: number;
  z: number;
}

class Backdrop {
  private readonly ctx: CanvasRenderingContext2D;
  private kind: BackdropKind = 'aurora';
  private photo: HTMLImageElement | null = null;
  private stars: Star[] = [];
  private gridOffset = 0;
  private w = 0;
  private h = 0;
  private scale = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    addEventListener('resize', () => this.resize());
  }

  setKind(kind: BackdropKind, photoUrl: string | null): void {
    this.kind = kind;
    this.photo = null;
    if (kind === 'photo' && photoUrl) {
      const img = new Image();
      img.onload = () => {
        this.photo = img;
        redraw();
      };
      img.src = photoUrl;
    }
    this.resize();
  }

  /** El fondo siempre se ve difuminado (CSS), así que se dibuja a baja resolución: se ve igual y cuesta mucho menos. */
  private resize(): void {
    this.scale = this.kind === 'aurora' ? 0.35 : 0.5;
    this.w = Math.round(this.canvas.clientWidth * this.scale);
    this.h = Math.round(this.canvas.clientHeight * this.scale);
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    if (this.kind === 'galaxy') this.makeStars();
    redraw();
  }

  draw(t: number, dt: number, s: Spectrum, p: Palette): void {
    if (!this.w || !this.h) return;
    switch (this.kind) {
      case 'ocean':
        return this.ocean(t, s, p);
      case 'retro':
        return this.retro(t, dt, s, p);
      case 'galaxy':
        return this.galaxy(t, dt, s, p);
      case 'photo':
        return this.photo ? this.drawPhoto(t, s, p) : this.aurora(t, s, p);
      default:
        return this.aurora(t, s, p);
    }
  }

  private aurora(t: number, s: Spectrum, p: Palette): void {
    const { ctx, w, h } = this;
    ctx.fillStyle = rgba(p.bg);
    ctx.fillRect(0, 0, w, h);
    const m = Math.max(w, h);
    const blobs: [Rgb, number, number, number, number, number][] = [
      // color, amplitud x, amplitud y, velocidad x, velocidad y, radio
      [p.accent, 0.35, 0.3, 0.05, 0.04, 0.6],
      [p.accent2, 0.4, 0.35, 0.035, 0.055, 0.5],
      [p.deep, 0.3, 0.4, 0.045, 0.03, 0.7],
      [mix(p.accent, p.accent2, 0.5), 0.45, 0.25, 0.025, 0.045, 0.45],
    ];
    blobs.forEach(([color, ax, ay, fx, fy, radius], k) => {
      const x = w * (0.5 + ax * Math.sin(t * fx * Math.PI * 2 + k * 1.3));
      const y = h * (0.5 + ay * Math.cos(t * fy * Math.PI * 2 + k * 2.1));
      const r = m * radius * (1 + 0.1 * s.bass);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, rgba(color, 0.55));
      gradient.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    });
  }

  private ocean(t: number, s: Spectrum, p: Palette): void {
    const { ctx, w, h } = this;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, rgba(p.bg));
    sky.addColorStop(1, rgba(p.deep));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const moon = ctx.createRadialGradient(
      w * 0.7,
      h * 0.14,
      0,
      w * 0.7,
      h * 0.14,
      Math.max(w, h) * 0.5,
    );
    moon.addColorStop(0, rgba(p.accent2, 0.22 + 0.1 * s.bass));
    moon.addColorStop(1, rgba(p.accent2, 0));
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, w, h);

    const layers = 5;
    const step = Math.max(4, w / 120);
    for (let l = 0; l < layers; l++) {
      const base = h * (0.42 + l * 0.12);
      const amp = h * 0.025 * (1 + l * 0.35) * (1 + 0.6 * s.bass);
      const wavelength = w * (1.1 - l * 0.13);
      const speed = 0.25 + l * 0.12;
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + step; x += step) {
        const y =
          base +
          amp * Math.sin((x / wavelength) * Math.PI * 2 + t * speed + l) +
          amp * 0.4 * Math.sin((x / wavelength) * Math.PI * 5 - t * speed * 1.3);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, h);
      ctx.closePath();
      const tone = l / (layers - 1);
      ctx.fillStyle = rgba(mix(p.accent2, p.accent, tone), 0.18 + tone * 0.25);
      ctx.fill();
    }
  }

  private retro(t: number, dt: number, s: Spectrum, p: Palette): void {
    const { ctx, w, h } = this;
    const horizon = h * 0.58;

    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, rgba(p.bg));
    sky.addColorStop(1, rgba(p.deep));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, horizon);

    // Sol con franjas que bajan.
    const R = Math.min(w, h) * 0.26;
    const cx = w / 2;
    const cy = horizon - R * 0.45;
    const halo = ctx.createRadialGradient(cx, cy, R * 0.6, cx, cy, R * 2);
    halo.addColorStop(0, rgba(p.accent, 0.35 + 0.25 * s.bass));
    halo.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, horizon);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, horizon);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();
    const sun = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    sun.addColorStop(0, rgba(p.accent2));
    sun.addColorStop(1, rgba(p.accent));
    ctx.fillStyle = sun;
    const split = cy - R * 0.05;
    ctx.fillRect(cx - R, cy - R, R * 2, split - (cy - R));
    const period = R * 0.2;
    const shift = (t * R * 0.08) % period;
    for (let y = split - period + shift; y < cy + R; y += period) {
      const gap = period * (0.15 + (0.55 * (y - split)) / R);
      ctx.fillRect(cx - R, Math.max(y, split), R * 2, period - gap - Math.max(0, split - y));
    }
    ctx.restore();

    ctx.fillStyle = rgba(mix(p.bg, [0, 0, 0], 0.4));
    ctx.fillRect(0, horizon, w, h - horizon);

    // Grilla en perspectiva que avanza más rápido con cada golpe.
    this.gridOffset = (this.gridOffset + dt * (0.6 + 1.6 * s.bass + 0.4 * s.energy)) % 1;
    ctx.strokeStyle = rgba(p.accent, 0.55 + 0.4 * s.bass);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const ground = h - horizon;
    for (let k = -14; k <= 14; k++) {
      ctx.moveTo(cx, horizon);
      ctx.lineTo(cx + k * w * 0.16 * 3, h + ground * 2);
    }
    for (let j = 0; j < 26; j++) {
      const y = horizon + ground * Math.pow(0.78, j + 1 - this.gridOffset) * 1.25;
      if (y > h) continue;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();

    const line = ctx.createLinearGradient(0, horizon - 2, 0, horizon + ground * 0.25);
    line.addColorStop(0, rgba(p.accent, 0.5));
    line.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = line;
    ctx.fillRect(0, horizon, w, ground * 0.25);
  }

  private makeStars(): void {
    const count = Math.max(150, Math.min(600, (this.w * this.h) / (2500 * this.scale ** 2)));
    this.stars = Array.from({ length: count }, () => ({
      x: Math.random() * 2 - 1,
      y: Math.random() * 2 - 1,
      z: Math.random(),
    }));
  }

  private galaxy(t: number, dt: number, s: Spectrum, p: Palette): void {
    const { ctx, w, h } = this;
    ctx.fillStyle = rgba(p.bg);
    ctx.fillRect(0, 0, w, h);
    const m = Math.max(w, h);
    const nebulas: [Rgb, number, number, number][] = [
      [p.accent, 0.3, 0.35, 0],
      [p.accent2, 0.7, 0.65, 2],
      [p.deep, 0.5, 0.5, 4],
    ];
    for (const [color, nx, ny, k] of nebulas) {
      const x = w * (nx + 0.08 * Math.sin(t * 0.03 + k));
      const y = h * (ny + 0.08 * Math.cos(t * 0.025 + k));
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, m * 0.55);
      gradient.addColorStop(0, rgba(color, 0.28));
      gradient.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    }

    const cx = w / 2;
    const cy = h / 2;
    const focal = m * 0.5;
    const speed = (0.03 + 0.12 * s.energy + 0.35 * s.bass) * dt;
    ctx.strokeStyle = '#fff';
    ctx.lineCap = 'round';
    for (const star of this.stars) {
      const prevZ = Math.min(1, star.z + speed * 4);
      star.z -= speed;
      if (star.z <= 0.02) {
        star.x = Math.random() * 2 - 1;
        star.y = Math.random() * 2 - 1;
        star.z = 1;
        continue;
      }
      const x = cx + (star.x / star.z) * focal;
      const y = cy + (star.y / star.z) * focal;
      if (x < 0 || x > w || y < 0 || y > h) continue;
      ctx.globalAlpha = Math.min(1, (1 - star.z) * 1.4);
      // Gruesas a propósito: con el fondo difuminado quedan como luces suaves.
      ctx.lineWidth = (1 - star.z) * 7;
      ctx.beginPath();
      ctx.moveTo(cx + (star.x / prevZ) * focal, cy + (star.y / prevZ) * focal);
      ctx.lineTo(x + 0.01, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** Foto del usuario a pantalla completa, con un zoom lento y oscurecida para que se lea el texto. */
  private drawPhoto(t: number, s: Spectrum, p: Palette): void {
    const { ctx, w, h } = this;
    const img = this.photo!;
    const cover = Math.max(w / img.width, h / img.height);
    const zoom = cover * (1.08 + 0.04 * Math.sin(t * 0.05) + 0.02 * s.bass);
    const dw = img.width * zoom;
    const dh = img.height * zoom;
    const x = (w - dw) / 2 + (dw - w) * 0.4 * Math.sin(t * 0.031);
    const y = (h - dh) / 2 + (dh - h) * 0.4 * Math.cos(t * 0.027);
    ctx.drawImage(img, x, y, dw, dh);

    const shade = ctx.createLinearGradient(0, 0, 0, h);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0.45)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.7)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, w, h);

    const pulse = ctx.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, Math.max(w, h) * 0.6);
    pulse.addColorStop(0, rgba(p.accent, 0.12 * s.bass));
    pulse.addColorStop(1, rgba(p.accent, 0));
    ctx.fillStyle = pulse;
    ctx.fillRect(0, 0, w, h);
  }
}

const spectrum = new Spectrum();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let backdrop: Backdrop | null = null;
let waves: OrbWaves | null = null;
let palette: Palette = readPalette();
let last = 0;
let running = false;

function frame(now: number): void {
  const t = now / 1000;
  const dt = Math.min(0.1, t - last);
  last = t;
  spectrum.update(t, dt);
  backdrop?.draw(t, dt, spectrum, palette);
  waves?.draw(spectrum, palette);
  if (running) requestAnimationFrame(frame);
}

/** Con «reducir movimiento» se dibuja un solo cuadro quieto en cada cambio. */
function redraw(): void {
  if (reducedMotion.matches) frame(last * 1000);
}

function loop(): void {
  running = !reducedMotion.matches;
  if (running) {
    requestAnimationFrame((now) => {
      last = now / 1000;
      frame(now);
    });
  } else {
    redraw();
  }
}

export function startVisuals(): void {
  const backdropCanvas = document.getElementById('backdrop') as HTMLCanvasElement | null;
  const wavesCanvas = document.getElementById('orb-waves') as HTMLCanvasElement | null;
  const orb = document.getElementById('orb');
  if (backdropCanvas) backdrop = new Backdrop(backdropCanvas);
  if (wavesCanvas && orb) waves = new OrbWaves(wavesCanvas, orb);
  reducedMotion.addEventListener('change', () => {
    running = false;
    loop();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    palette = readPalette();
    redraw();
  });
  loop();
}

/** Cambia el fondo; llamar después de aplicar el tema para tomar sus colores. */
export function setBackdrop(kind: BackdropKind, photoUrl: string | null): void {
  palette = readPalette();
  backdrop?.setKind(kind, photoUrl);
}

export function setPlaying(playing: boolean): void {
  spectrum.playing = playing;
  if (reducedMotion.matches) spectrum.energy = playing ? 1 : 0;
  redraw();
}
