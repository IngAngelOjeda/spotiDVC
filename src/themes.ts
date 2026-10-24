// Temas visuales: paleta (definida en style.css con [data-theme]) y fondo animado del canvas.
export type BackdropKind = 'aurora' | 'ocean' | 'retro' | 'galaxy' | 'photo';

export interface Theme {
  id: string;
  name: string;
  backdrop: BackdropKind;
  /** Vista previa para el selector de Ajustes. */
  preview: string;
}

export const THEMES: Theme[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    backdrop: 'aurora',
    preview: 'linear-gradient(135deg, #2a1d5c, #8b5cf6 55%, #22d3a6)',
  },
  {
    id: 'verde',
    name: 'Verde',
    backdrop: 'aurora',
    preview: 'linear-gradient(135deg, #04140c, #1db954 55%, #b8f75d)',
  },
  {
    id: 'lava',
    name: 'Lava',
    backdrop: 'aurora',
    preview: 'linear-gradient(135deg, #1a0606, #ff4d2e 55%, #ffb627)',
  },
  {
    id: 'oceano',
    name: 'Océano',
    backdrop: 'ocean',
    preview: 'linear-gradient(180deg, #03142b, #0a5d8f 60%, #2de2e6)',
  },
  {
    id: 'retro',
    name: 'Retro',
    backdrop: 'retro',
    preview: 'linear-gradient(180deg, #14002b, #ff2e88 62%, #ffd23f)',
  },
  {
    id: 'galaxia',
    name: 'Galaxia',
    backdrop: 'galaxy',
    preview: 'radial-gradient(circle at 35% 40%, #6d4bff, #12072e 45%, #020107)',
  },
  {
    id: 'foto',
    name: 'Tu foto',
    backdrop: 'photo',
    preview: 'linear-gradient(135deg, #3a3a4a, #8a8aa0)',
  },
];

export const DEFAULT_THEME = THEMES[0]!;

const THEME_KEY = 'spotidvc.theme';
const PHOTO_KEY = 'spotidvc.photo';
/** Lado mayor de la foto guardada: nítida en pantallas Full HD sin pasarse del cupo de localStorage. */
const PHOTO_MAX_SIDE = 1920;

export function findTheme(id: string | null): Theme {
  return THEMES.find((theme) => theme.id === id) ?? DEFAULT_THEME;
}

export function getSavedTheme(): Theme {
  try {
    return findTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme.id);
  } catch {
    // Sin almacenamiento: el tema dura hasta recargar.
  }
}

/** Aplica la paleta del tema y la barra del sistema (theme-color). */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme.id === DEFAULT_THEME.id) delete root.dataset.theme;
  else root.dataset.theme = theme.id;

  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.dataset.original ??= meta.content;
    meta.content = theme.id === DEFAULT_THEME.id ? meta.dataset.original : bg;
  });
}

export function getSavedPhoto(): string | null {
  try {
    return localStorage.getItem(PHOTO_KEY);
  } catch {
    return null;
  }
}

/** Achica la imagen elegida, la guarda como JPEG y devuelve su data URL. */
export async function savePhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.85, 0.7, 0.55]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    try {
      localStorage.setItem(PHOTO_KEY, url);
      return url;
    } catch {
      // No entra en localStorage: probar con más compresión.
    }
  }
  throw new Error('La imagen es demasiado pesada para guardarla.');
}
