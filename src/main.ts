import './style.css';
import { handleCallback, isLoggedIn, login, logout, onAuthLost, AuthError } from './auth';
import { parse, stripWakeWord, type Command } from './commands';
import { isSpeechSupported, VoiceListener } from './speech';
import * as spotify from './spotify';
import * as ui from './ui';
import { keepScreenOn } from './wakelock';

const LANG_KEY = 'spotidvc.lang';
const DEBOUNCE_MS = 1500;
const POLL_MS = 5000;

const FEEDBACK: Record<Exclude<Command, 'volumeUp' | 'volumeDown'>, string> = {
  play: '▶ Reanudado',
  pause: '⏸ Pausado',
  next: '⏭ Siguiente',
  previous: '⏮ Anterior',
};

let lastCommand: { command: Command; at: number } | null = null;
let pollTimer: ReturnType<typeof setInterval> | undefined;
let busy = false;

const lang = localStorage.getItem(LANG_KEY) ?? 'es-US';

const listener = new VoiceListener(
  {
    onResult: handleSpeech,
    onListeningChange(on) {
      ui.setListening(on);
      keepScreenOn(on);
    },
    onProblem(problem) {
      switch (problem) {
        case 'not-allowed':
          ui.reply('🎙 Sin permiso para el micrófono', 'error');
          ui.showSpeechWarning(
            'Dá permiso al micrófono: tocá el candado de la barra de direcciones → Micrófono → Permitir, y recargá.',
          );
          listener.stop();
          break;
        case 'audio-capture':
          ui.reply('🎙 No encuentro ningún micrófono', 'error');
          listener.stop();
          break;
        case 'network':
          ui.showHeard('Sin conexión para reconocer la voz. Reintentando…');
          break;
        default:
          break;
      }
    },
  },
  lang,
);

function handleSpeech(alternatives: string[]): void {
  ui.showHeard(alternatives[0] ?? '');
  for (const text of alternatives) {
    const command = parse(text);
    if (!command) continue;
    const now = Date.now();
    if (lastCommand?.command === command && now - lastCommand.at < DEBOUNCE_MS) return;
    lastCommand = { command, at: now };
    ui.say(text);
    void execute(command);
    return;
  }
  // Empezó con «música» pero no es un comando conocido: responder; si no, es charla y se ignora.
  const withWakeWord = alternatives.find((text) => stripWakeWord(text) !== null);
  if (withWakeWord !== undefined) {
    ui.say(withWakeWord);
    const rest = stripWakeWord(withWakeWord);
    ui.reply(
      rest
        ? `🤔 No entendí «${rest}». Probá: play, pausa, siguiente, anterior, subí, bajá`
        : '👂 ¿Sí? Decime qué hago',
      'info',
    );
  }
}

async function execute(command: Command): Promise<void> {
  if (busy) return;
  busy = true;
  ui.setOrb('working');
  try {
    if (command === 'volumeUp' || command === 'volumeDown') {
      const volume = await spotify.changeVolume(command === 'volumeUp' ? 1 : -1);
      ui.reply(`${command === 'volumeUp' ? '🔊' : '🔉'} Volumen ${volume}%`);
    } else {
      await spotify[command]();
      ui.reply(FEEDBACK[command]);
    }
    // Spotify tarda un instante en reflejar el cambio.
    setTimeout(() => void refreshPlayback(), 700);
  } catch (error) {
    handleError(error);
  } finally {
    busy = false;
  }
}

function handleError(error: unknown): void {
  if (error instanceof spotify.SpotifyError) {
    ui.reply(`⚠ ${error.message}`, 'error');
    if (error.kind === 'auth') endSession('Tu sesión venció. Conectá Spotify de nuevo.');
    if (error.kind === 'no-device') void refreshDevices();
  } else {
    console.error(error);
    ui.reply('⚠ Algo salió mal. Probá de nuevo.', 'error');
  }
}

async function refreshPlayback(): Promise<void> {
  try {
    ui.renderPlayback(await spotify.getPlayback());
  } catch (error) {
    if (error instanceof spotify.SpotifyError && error.kind === 'auth') handleError(error);
    // Otros errores del sondeo no molestan al usuario: se reintenta en el próximo ciclo.
  }
}

async function refreshDevices(): Promise<void> {
  try {
    ui.renderDevices(await spotify.getDevices(), spotify.getPreferredDevice());
  } catch (error) {
    handleError(error);
  }
}

async function changeDevice(id: string): Promise<void> {
  spotify.setPreferredDevice(id);
  try {
    await spotify.transfer(id, false);
    ui.reply('🎧 Listo, controlo ese dispositivo', 'info');
    setTimeout(() => {
      void refreshPlayback();
      void refreshDevices();
    }, 700);
  } catch (error) {
    handleError(error);
  }
}

function startPolling(): void {
  stopPolling();
  void refreshPlayback();
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void refreshPlayback();
  }, POLL_MS);
}

function stopPolling(): void {
  clearInterval(pollTimer);
}

function startSession(): void {
  ui.showMain();
  startPolling();
  void refreshDevices();
}

function endSession(message = ''): void {
  listener.stop();
  stopPolling();
  logout();
  ui.showLogin(message);
}

ui.bind({
  onLogin() {
    login().catch((error: unknown) => {
      ui.showLogin(error instanceof AuthError ? error.message : 'No se pudo iniciar el login.');
    });
  },
  onToggleListening() {
    if (!isSpeechSupported()) return;
    if (listener.active) listener.stop();
    else {
      ui.showSpeechWarning('');
      listener.start();
    }
  },
  onAction(command) {
    void execute(command);
  },
  onDeviceChange(id) {
    if (id) void changeDevice(id);
  },
  onRefreshDevices() {
    void refreshDevices();
  },
  onLangChange(value) {
    localStorage.setItem(LANG_KEY, value);
    listener.setLang(value);
  },
  onLogout() {
    endSession();
  },
});

onAuthLost(() => endSession('Tu sesión venció. Conectá Spotify de nuevo.'));

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isLoggedIn()) {
    void refreshPlayback();
    void refreshDevices();
  }
});

async function boot(): Promise<void> {
  ui.setLang(lang);
  if (!isSpeechSupported()) {
    ui.showSpeechWarning(
      'Este navegador no reconoce voz (probá con Chrome o Edge). Los botones funcionan igual.',
    );
  }

  const callback = await handleCallback();
  if (callback && !callback.ok) {
    ui.showLogin(callback.message);
    return;
  }
  if (!isLoggedIn()) {
    ui.showLogin();
    return;
  }
  startSession();
  ui.reply(
    callback?.ok
      ? '👋 ¡Conectado! Tocá el orbe y decí «música play»'
      : '👋 Hola. Tocá el orbe y decime qué hago',
    'info',
  );
}

void boot();
