import { AuthError, getAccessToken, refreshToken } from './auth';

export const API_URL = 'https://api.spotify.com/v1';
const DEVICE_KEY = 'spotidvc.deviceId';
const VOLUME_STEP = 10;

/** Tiempos configurables para que los tests no esperen de verdad. */
export const timing = {
  /** Espera tras transferir la reproducción para que Spotify registre el dispositivo. */
  transferDelayMs: 400,
  /** Si Spotify pide esperar más que esto (segundos), se avisa en lugar de quedar trabado. */
  maxRetryAfterS: 10,
};

export type SpotifyErrorKind =
  | 'auth'
  | 'config'
  | 'premium'
  | 'no-device'
  | 'volume-forbidden'
  | 'restricted'
  | 'rate-limited'
  | 'network'
  | 'unknown';

export class SpotifyError extends Error {
  constructor(
    readonly kind: SpotifyErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface Device {
  id: string | null;
  name: string;
  type: string;
  is_active: boolean;
  is_restricted: boolean;
  volume_percent: number | null;
  supports_volume?: boolean;
}

export interface PlaybackState {
  is_playing: boolean;
  progress_ms: number | null;
  device: Device;
  item: {
    name: string;
    duration_ms: number;
    artists?: { name: string }[];
    album?: { name: string; images: { url: string; width: number | null }[] };
    show?: { name: string; images: { url: string }[] };
  } | null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const VOLUME_FORBIDDEN = 'Este dispositivo no deja cambiar el volumen desde la app.';

const authError = () =>
  new SpotifyError('auth', 'La sesión de Spotify venció. Volvé a conectar.', 401);
const networkError = () =>
  new SpotifyError('network', 'Sin conexión con Spotify. Revisá internet.');
const noDeviceError = (status?: number) =>
  new SpotifyError('no-device', 'Abrí Spotify en algún dispositivo.', status);

/** Envía la request con token, refrescando ante 401 y respetando Retry-After ante 429. */
async function send(method: string, path: string, body?: unknown): Promise<Response> {
  let refreshed = false;
  let rateLimited = false;

  for (;;) {
    let token: string | null;
    try {
      token = await getAccessToken();
    } catch (error) {
      if (error instanceof AuthError) throw new SpotifyError('config', error.message);
      throw networkError();
    }
    if (!token) throw authError();

    let response: Response;
    try {
      response = await fetch(API_URL + path, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw networkError();
    }

    if (response.status === 401 && !refreshed) {
      refreshed = true;
      let ok: boolean;
      try {
        ok = await refreshToken();
      } catch {
        throw networkError();
      }
      if (!ok) throw authError();
      continue;
    }

    if (response.status === 429 && !rateLimited) {
      const retryAfter = Number(response.headers.get('Retry-After')) || 1;
      if (retryAfter <= timing.maxRetryAfterS) {
        rateLimited = true;
        await wait(retryAfter * 1000);
        continue;
      }
    }

    return response;
  }
}

/** Como send, pero convierte cualquier respuesta no exitosa en SpotifyError. */
async function call(method: string, path: string, body?: unknown): Promise<Response> {
  const response = await send(method, path, body);
  if (response.ok) return response;
  throw await toError(response, path);
}

async function toError(response: Response, path: string): Promise<SpotifyError> {
  let reason = '';
  let message = '';
  try {
    const data = (await response.json()) as { error?: { reason?: string; message?: string } };
    reason = data.error?.reason ?? '';
    message = data.error?.message ?? '';
  } catch {
    // Cuerpo vacío o que no es JSON.
  }
  const status = response.status;

  if (status === 401) return authError();
  if (status === 403) {
    if (reason === 'PREMIUM_REQUIRED' || /premium/i.test(message)) {
      return new SpotifyError(
        'premium',
        'Hace falta Spotify Premium para controlar la reproducción.',
        status,
      );
    }
    if (path.startsWith('/me/player/volume')) {
      return new SpotifyError('volume-forbidden', VOLUME_FORBIDDEN, status);
    }
    return new SpotifyError(
      'restricted',
      'Spotify no permitió esa acción en este momento.',
      status,
    );
  }
  if (status === 404 && (reason === 'NO_ACTIVE_DEVICE' || /device/i.test(message))) {
    return noDeviceError(status);
  }
  if (status === 429) {
    const seconds = Number(response.headers.get('Retry-After')) || 0;
    return new SpotifyError(
      'rate-limited',
      seconds
        ? `Spotify pidió esperar ${seconds} s antes de otro comando.`
        : 'Demasiados comandos seguidos. Esperá un momento.',
      status,
    );
  }
  return new SpotifyError('unknown', `Spotify respondió con un error (${status}).`, status);
}

export function getPreferredDevice(): string | null {
  return localStorage.getItem(DEVICE_KEY);
}

export function setPreferredDevice(id: string | null): void {
  if (id) localStorage.setItem(DEVICE_KEY, id);
  else localStorage.removeItem(DEVICE_KEY);
}

export async function getDevices(): Promise<Device[]> {
  const response = await call('GET', '/me/player/devices');
  const data = (await response.json()) as { devices?: Device[] };
  return data.devices ?? [];
}

/** Estado actual, o null si no hay nada cargado en ningún dispositivo. */
export async function getPlayback(): Promise<PlaybackState | null> {
  const response = await call('GET', '/me/player');
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? (JSON.parse(text) as PlaybackState) : null;
}

export async function transfer(deviceId: string, play = false): Promise<void> {
  await call('PUT', '/me/player', { device_ids: [deviceId], play });
}

/** Transfiere la reproducción al dispositivo elegido en el selector (o al primero disponible). */
async function activateDevice(): Promise<Device> {
  const devices = (await getDevices()).filter((d) => d.id && !d.is_restricted);
  const preferred = getPreferredDevice();
  const device =
    devices.find((d) => d.id === preferred) ?? devices.find((d) => d.is_active) ?? devices[0];
  if (!device) throw noDeviceError();
  await transfer(device.id!, false);
  await wait(timing.transferDelayMs);
  return device;
}

/** Ejecuta un comando y, si no hay dispositivo activo, activa uno y reintenta una vez. */
async function playerCommand(method: string, path: string): Promise<void> {
  try {
    await call(method, path);
  } catch (error) {
    if (!(error instanceof SpotifyError) || error.kind !== 'no-device') throw error;
    await activateDevice();
    await call(method, path);
  }
}

export const play = () => playerCommand('PUT', '/me/player/play');
export const pause = () => playerCommand('PUT', '/me/player/pause');
export const next = () => playerCommand('POST', '/me/player/next');
export const previous = () => playerCommand('POST', '/me/player/previous');

export async function setVolume(percent: number): Promise<number> {
  const volume = Math.max(0, Math.min(100, Math.round(percent)));
  await playerCommand('PUT', `/me/player/volume?volume_percent=${volume}`);
  return volume;
}

/** Sube o baja el volumen en pasos de 10 y devuelve el volumen nuevo. */
export async function changeVolume(direction: 1 | -1): Promise<number> {
  let state = await getPlayback();
  if (!state) {
    await activateDevice();
    state = await getPlayback();
  }
  if (!state) throw noDeviceError();
  const { device } = state;
  if (device.supports_volume === false || device.volume_percent === null) {
    throw new SpotifyError('volume-forbidden', VOLUME_FORBIDDEN);
  }
  return setVolume(device.volume_percent + direction * VOLUME_STEP);
}
