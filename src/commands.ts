export type Command = 'play' | 'pause' | 'next' | 'previous' | 'volumeUp' | 'volumeDown';

export const WAKE_WORD = 'musica';

const PHRASES: Record<Command, string[]> = {
  play: ['play', 'reproducir', 'dale', 'seguir'],
  pause: ['pausa', 'pausar', 'parar', 'stop'],
  next: ['siguiente', 'proxima', 'proximo', 'pasa'],
  previous: ['anterior', 'atras', 'volve'],
  volumeUp: ['subi', 'mas fuerte'],
  volumeDown: ['baja', 'mas bajo'],
};

/** Minúsculas, sin tildes ni signos de puntuación y con un solo espacio entre palabras. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Devuelve el texto que sigue a la palabra de activación, o null si la frase no empieza con ella. */
export function stripWakeWord(text: string): string | null {
  const normalized = normalize(text);
  if (normalized !== WAKE_WORD && !normalized.startsWith(WAKE_WORD + ' ')) return null;
  return normalized.slice(WAKE_WORD.length).trim();
}

/** Texto reconocido → comando. Solo responde si la frase empieza con «música». */
export function parse(text: string): Command | null {
  const rest = stripWakeWord(text);
  if (!rest) return null;
  for (const [command, phrases] of Object.entries(PHRASES) as [Command, string[]][]) {
    if (phrases.some((phrase) => rest === phrase || rest.startsWith(phrase + ' '))) {
      return command;
    }
  }
  return null;
}
