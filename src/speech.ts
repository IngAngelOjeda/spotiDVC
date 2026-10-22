// La Web Speech API no está en las definiciones de TypeScript: tipos mínimos que usamos.
interface RecognitionAlternative {
  transcript: string;
}
interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: RecognitionAlternative;
}
interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: { readonly length: number; [index: number]: RecognitionResult };
}
interface RecognitionErrorEvent {
  readonly error: string;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionConstructor = new () => Recognition;

export type SpeechProblem = 'not-allowed' | 'network' | 'audio-capture' | 'other';

export interface SpeechCallbacks {
  /** Todas las alternativas de un resultado final, de la más a la menos probable. */
  onResult(alternatives: string[]): void;
  onListeningChange(listening: boolean): void;
  onProblem(problem: SpeechProblem, detail: string): void;
}

const RESTART_DELAY_MS = 250;
const MAX_RESTART_DELAY_MS = 5000;

function recognitionConstructor(): RecognitionConstructor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isSpeechSupported(): boolean {
  return recognitionConstructor() !== null;
}

/** Escucha continua con reinicio automático cuando el navegador corta el reconocimiento. */
export class VoiceListener {
  private recognition: Recognition | null = null;
  private wanted = false;
  private restartDelay = RESTART_DELAY_MS;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly callbacks: SpeechCallbacks,
    private lang = 'es-US',
  ) {}

  get active(): boolean {
    return this.wanted;
  }

  start(): void {
    this.wanted = true;
    this.restartDelay = RESTART_DELAY_MS;
    this.callbacks.onListeningChange(true);
    this.launch();
  }

  stop(): void {
    this.wanted = false;
    clearTimeout(this.restartTimer);
    this.recognition?.abort();
    this.recognition = null;
    this.callbacks.onListeningChange(false);
  }

  setLang(lang: string): void {
    this.lang = lang;
    if (this.wanted) this.recognition?.abort(); // onend lo reinicia con el idioma nuevo
  }

  private launch(): void {
    const Ctor = recognitionConstructor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = this.lang;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    recognition.onstart = () => {
      this.restartDelay = RESTART_DELAY_MS;
    };

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (!result?.isFinal) continue;
        const alternatives: string[] = [];
        for (let j = 0; j < result.length; j++) {
          const transcript = result[j]?.transcript.trim();
          if (transcript) alternatives.push(transcript);
        }
        if (alternatives.length) this.callbacks.onResult(alternatives);
      }
    };

    recognition.onerror = (event) => {
      switch (event.error) {
        case 'no-speech':
        case 'aborted':
          return; // onend se encarga de reiniciar
        case 'not-allowed':
        case 'service-not-allowed':
          this.wanted = false;
          this.callbacks.onProblem('not-allowed', event.error);
          return;
        case 'audio-capture':
          this.wanted = false;
          this.callbacks.onProblem('audio-capture', event.error);
          return;
        case 'network':
          // Reintentar más despacio para no entrar en un bucle sin conexión.
          this.restartDelay = Math.min(this.restartDelay * 2, MAX_RESTART_DELAY_MS);
          this.callbacks.onProblem('network', event.error);
          return;
        default:
          this.callbacks.onProblem('other', event.error);
      }
    };

    recognition.onend = () => {
      if (this.recognition !== recognition) return;
      if (!this.wanted) {
        this.recognition = null;
        this.callbacks.onListeningChange(false);
        return;
      }
      clearTimeout(this.restartTimer);
      this.restartTimer = setTimeout(() => {
        if (this.wanted && this.recognition === recognition) this.launch();
      }, this.restartDelay);
    };

    this.recognition = recognition;
    try {
      recognition.start();
    } catch {
      // InvalidStateError si ya estaba arrancando: onend vuelve a intentar.
    }
  }
}
