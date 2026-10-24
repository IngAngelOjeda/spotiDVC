import type { Command } from './commands';
import type { Device, PlaybackState } from './spotify';
import type { Theme } from './themes';

export type OrbState = 'idle' | 'listening' | 'working' | 'ok' | 'error';
export type ReplyKind = 'ok' | 'error' | 'info';

export interface UiHandlers {
  onLogin(): void;
  onToggleListening(): void;
  onAction(command: Command): void;
  onDeviceChange(id: string): void;
  onRefreshDevices(): void;
  onLangChange(lang: string): void;
  onLogout(): void;
  onThemeChange(id: string): void;
  onPhotoPicked(file: File): void;
}

const MAX_FEED = 30;

function $<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Falta #${id} en index.html`);
  return element as T;
}

const el = {
  loginView: $('login-view'),
  loginBtn: $<HTMLButtonElement>('login-btn'),
  loginError: $('login-error'),
  mainView: $('main-view'),
  settingsBtn: $<HTMLButtonElement>('settings-btn'),
  settings: $<HTMLDialogElement>('settings'),
  langSelect: $<HTMLSelectElement>('lang-select'),
  logoutBtn: $<HTMLButtonElement>('logout-btn'),
  orb: $<HTMLButtonElement>('orb'),
  reply: $('reply'),
  heard: $('heard'),
  speechWarning: $('speech-warning'),
  cover: $('cover'),
  track: $('track'),
  artist: $('artist'),
  deviceName: $('device-name'),
  volumeLabel: $('volume-label'),
  playPause: $<HTMLButtonElement>('playpause'),
  deviceSelect: $<HTMLSelectElement>('device-select'),
  devicesRefresh: $<HTMLButtonElement>('devices-refresh'),
  feed: $('feed'),
  drawer: $('drawer'),
  themePicker: $('theme-picker'),
  photoInput: $<HTMLInputElement>('photo-input'),
};

let orbResetTimer: ReturnType<typeof setTimeout> | undefined;
let listening = false;
let drawerTimer: ReturnType<typeof setTimeout> | undefined;
let themeState = { selected: '', hasPhoto: false };

export function bind(handlers: UiHandlers): void {
  bindDrawer();
  el.loginBtn.addEventListener('click', handlers.onLogin);
  el.orb.addEventListener('click', handlers.onToggleListening);
  el.settingsBtn.addEventListener('click', () => el.settings.showModal());
  el.langSelect.addEventListener('change', () => handlers.onLangChange(el.langSelect.value));
  el.logoutBtn.addEventListener('click', () => {
    el.settings.close();
    handlers.onLogout();
  });
  el.deviceSelect.addEventListener('change', () => handlers.onDeviceChange(el.deviceSelect.value));
  el.devicesRefresh.addEventListener('click', handlers.onRefreshDevices);
  el.themePicker.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-theme-id]');
    const id = button?.dataset.themeId;
    if (!id) return;
    // «Tu foto» abre la galería si todavía no hay foto o si ya estaba elegida (para cambiarla).
    if (id === 'foto' && (!themeState.hasPhoto || themeState.selected === 'foto')) {
      el.photoInput.click();
    } else {
      handlers.onThemeChange(id);
    }
  });
  el.photoInput.addEventListener('change', () => {
    const file = el.photoInput.files?.[0];
    el.photoInput.value = '';
    if (file) handlers.onPhotoPicked(file);
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
    button.addEventListener('click', () => handlers.onAction(button.dataset.action as Command));
  });
}

const DRAWER_TOUCH_MS = 6000;

/**
 * Lo de abajo del orbe está escondido: con mouse aparece al pasar por encima (CSS :hover).
 * Con el dedo no hay hover, así que el primer toque solo lo muestra (sin activar el botón
 * que esté debajo) y se vuelve a esconder unos segundos después del último toque.
 */
function bindDrawer(): void {
  let revealing = false;
  el.drawer.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType === 'mouse') return;
      revealing = !el.drawer.classList.contains('is-open');
      el.drawer.classList.add('is-open');
      clearTimeout(drawerTimer);
      drawerTimer = setTimeout(() => el.drawer.classList.remove('is-open'), DRAWER_TOUCH_MS);
    },
    true,
  );
  el.drawer.addEventListener(
    'click',
    (event) => {
      if (!revealing) return;
      revealing = false;
      event.preventDefault();
      event.stopPropagation();
    },
    true,
  );
}

export function showLogin(error = ''): void {
  el.mainView.hidden = true;
  el.settingsBtn.hidden = true;
  el.loginView.hidden = false;
  el.loginError.textContent = error;
}

export function showMain(): void {
  el.loginView.hidden = true;
  el.mainView.hidden = false;
  el.settingsBtn.hidden = false;
}

export function setLang(lang: string): void {
  el.langSelect.value = lang;
}

export function renderThemes(themes: Theme[], selectedId: string, photoUrl: string | null): void {
  themeState = { selected: selectedId, hasPhoto: !!photoUrl };
  el.themePicker.replaceChildren(
    ...themes.map((theme) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'theme-option';
      button.dataset.themeId = theme.id;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(theme.id === selectedId));
      const swatch = document.createElement('span');
      swatch.className = 'theme-swatch';
      swatch.style.background =
        theme.id === 'foto' && photoUrl ? `center / cover url("${photoUrl}")` : theme.preview;
      const name = document.createElement('span');
      name.textContent = theme.name;
      button.append(swatch, name);
      return button;
    }),
  );
}

export function setListening(on: boolean): void {
  listening = on;
  el.orb.setAttribute('aria-pressed', String(on));
  el.orb.setAttribute('aria-label', on ? 'Dejar de escuchar' : 'Escuchar');
  setOrb(on ? 'listening' : 'idle');
}

/** Estado visual del orbe. «ok» y «error» son destellos que vuelven al estado de escucha. */
export function setOrb(state: OrbState): void {
  clearTimeout(orbResetTimer);
  el.orb.dataset.state = state;
  if (state === 'ok' || state === 'error') {
    orbResetTimer = setTimeout(() => setOrb(listening ? 'listening' : 'idle'), 1200);
  }
}

export function showSpeechWarning(text: string): void {
  el.speechWarning.textContent = text;
  el.speechWarning.hidden = !text;
}

/** Lo último que reconoció el micrófono, aunque no sea un comando. */
export function showHeard(text: string): void {
  el.heard.textContent = text ? `«${text}»` : '';
}

/** Mensaje del usuario en la conversación. */
export function say(text: string): void {
  addBubble('user', text);
}

/** Respuesta del agente: texto grande bajo el orbe y burbuja en la conversación. */
export function reply(text: string, kind: ReplyKind = 'ok'): void {
  el.reply.textContent = text;
  el.reply.dataset.kind = kind;
  el.reply.classList.remove('pop');
  void el.reply.offsetWidth; // reinicia la animación
  el.reply.classList.add('pop');
  addBubble('agent', text, kind);
  if (kind !== 'info') setOrb(kind === 'ok' ? 'ok' : 'error');
}

function addBubble(from: 'user' | 'agent', text: string, kind: ReplyKind = 'info'): void {
  const item = document.createElement('li');
  item.className = `bubble bubble--${from} bubble--${kind}`;
  const body = document.createElement('span');
  body.textContent = text;
  const time = document.createElement('time');
  time.textContent = new Date().toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  item.append(body, time);
  el.feed.append(item);
  while (el.feed.children.length > MAX_FEED) el.feed.firstElementChild?.remove();
  el.feed.scrollTop = el.feed.scrollHeight;
}

export function renderPlayback(state: PlaybackState | null): void {
  const item = state?.item;
  el.playPause.classList.toggle('is-playing', !!state?.is_playing);
  el.playPause.dataset.action = state?.is_playing ? 'pause' : 'play';
  el.playPause.setAttribute('aria-label', state?.is_playing ? 'Pausar' : 'Reproducir');

  el.track.textContent = item?.name ?? 'Nada sonando';
  el.artist.textContent = item
    ? (item.artists?.map((a) => a.name).join(', ') ?? item.show?.name ?? '')
    : 'Abrí Spotify en algún dispositivo';

  // La portada más chica que siga viéndose nítida en 160 px.
  const images: { url: string; width?: number | null }[] =
    item?.album?.images ?? item?.show?.images ?? [];
  const image =
    [...images]
      .sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
      .find((img) => (img.width ?? 0) >= 160) ?? images[0];
  el.cover.replaceChildren();
  if (image) {
    const img = document.createElement('img');
    img.src = image.url;
    img.alt = '';
    el.cover.append(img);
  } else {
    el.cover.innerHTML = '<span>♪</span>';
  }

  el.deviceName.textContent = state ? deviceIcon(state.device.type) + ' ' + state.device.name : '';
  el.deviceName.hidden = !state;
  const volume = state?.device.volume_percent;
  el.volumeLabel.textContent = volume == null ? '' : `🔊 ${volume}%`;
  el.volumeLabel.hidden = volume == null;
}

export function renderDevices(devices: Device[], selectedId: string | null): void {
  el.deviceSelect.replaceChildren();
  if (!devices.length) {
    el.deviceSelect.append(new Option('Ningún dispositivo con Spotify abierto', ''));
    el.deviceSelect.disabled = true;
    return;
  }
  el.deviceSelect.disabled = false;
  const active = devices.find((d) => d.is_active)?.id ?? null;
  const selected = devices.some((d) => d.id === selectedId) ? selectedId : active;
  for (const device of devices) {
    if (!device.id) continue;
    const label = `${deviceIcon(device.type)} ${device.name}${device.is_active ? ' · activo' : ''}`;
    const option = new Option(label, device.id, false, device.id === selected);
    option.disabled = device.is_restricted;
    el.deviceSelect.append(option);
  }
}

function deviceIcon(type: string): string {
  switch (type.toLowerCase()) {
    case 'smartphone':
      return '📱';
    case 'computer':
      return '💻';
    case 'speaker':
      return '🔈';
    case 'tv':
      return '📺';
    default:
      return '🎧';
  }
}
