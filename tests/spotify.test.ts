import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { onAuthLost, TOKEN_URL } from '../src/auth';
import {
  API_URL,
  changeVolume,
  getPlayback,
  next,
  pause,
  play,
  setPreferredDevice,
  SpotifyError,
  timing,
} from '../src/spotify';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

type Handler = (call: Call) => Response;

let calls: Call[];
let handlers: Handler[];

/** Cada llamada a fetch consume el siguiente handler de la cola. */
function respond(...queue: Handler[]) {
  handlers.push(...queue);
}

const json =
  (status: number, data: unknown, headers: Record<string, string> = {}) =>
  () =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
const empty =
  (status = 204) =>
  () =>
    new Response(null, { status });
const spotifyError = (status: number, reason: string, message = '') =>
  json(status, { error: { status, message, reason } });
const tokens = (access: string, refresh?: string) =>
  json(200, { access_token: access, refresh_token: refresh, expires_in: 3600 });

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  };
}

function loginWith(access: string, expiresInMs = 3_600_000) {
  localStorage.setItem('spotidvc.accessToken', access);
  localStorage.setItem('spotidvc.refreshToken', 'refresh-1');
  localStorage.setItem('spotidvc.expiresAt', String(Date.now() + expiresInMs));
}

async function catchError(promise: Promise<unknown>): Promise<SpotifyError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SpotifyError) return error;
    throw error;
  }
  throw new Error('Se esperaba un SpotifyError');
}

beforeEach(() => {
  calls = [];
  handlers = [];
  timing.transferDelayMs = 0;
  vi.stubEnv('VITE_SPOTIFY_CLIENT_ID', 'client-test');
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit = {}) => {
      const call: Call = {
        url: input,
        method: init.method ?? 'GET',
        headers: (init.headers ?? {}) as Record<string, string>,
        body: init.body === undefined ? undefined : String(init.body),
      };
      calls.push(call);
      const handler = handlers.shift();
      if (!handler) throw new Error(`fetch inesperado: ${call.method} ${call.url}`);
      return handler(call);
    }),
  );
  loginWith('access-1');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('comandos básicos', () => {
  it('envía el comando con el token', async () => {
    respond(empty());
    await play();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: `${API_URL}/me/player/play`,
      method: 'PUT',
      headers: { Authorization: 'Bearer access-1' },
    });
  });

  it('usa el método y la ruta de cada acción', async () => {
    respond(empty(), empty());
    await pause();
    await next();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `PUT ${API_URL}/me/player/pause`,
      `POST ${API_URL}/me/player/next`,
    ]);
  });

  it('getPlayback devuelve null con 204', async () => {
    respond(empty(204));
    expect(await getPlayback()).toBeNull();
  });
});

describe('401 y refresh del token', () => {
  it('refresca el token y reintenta una vez', async () => {
    respond(spotifyError(401, ''), tokens('access-2', 'refresh-2'), empty());
    await next();

    expect(calls[1]!.url).toBe(TOKEN_URL);
    const body = new URLSearchParams(calls[1]!.body);
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('refresh-1');
    expect(body.get('client_id')).toBe('client-test');
    expect(calls[2]!.headers.Authorization).toBe('Bearer access-2');
    expect(localStorage.getItem('spotidvc.refreshToken')).toBe('refresh-2');
  });

  it('refresca antes de llamar si el token vence en menos de un minuto', async () => {
    loginWith('access-viejo', 30_000);
    respond(tokens('access-nuevo'), empty());
    await play();

    expect(calls[0]!.url).toBe(TOKEN_URL);
    expect(calls[1]!.headers.Authorization).toBe('Bearer access-nuevo');
    // Spotify no siempre devuelve un refresh token nuevo: se conserva el anterior.
    expect(localStorage.getItem('spotidvc.refreshToken')).toBe('refresh-1');
  });

  it('si el refresh falla, cierra la sesión y avisa', async () => {
    const lost = vi.fn();
    onAuthLost(lost);
    respond(spotifyError(401, ''), json(400, { error: 'invalid_grant' }));

    const error = await catchError(play());
    expect(error.kind).toBe('auth');
    expect(lost).toHaveBeenCalledOnce();
    expect(localStorage.getItem('spotidvc.refreshToken')).toBeNull();
  });

  it('no reintenta más de una vez si vuelve a dar 401', async () => {
    respond(spotifyError(401, ''), tokens('access-2'), spotifyError(401, ''));
    const error = await catchError(play());
    expect(error.kind).toBe('auth');
    expect(calls).toHaveLength(3);
  });

  it('sin sesión no llama a la API', async () => {
    localStorage.clear();
    const error = await catchError(play());
    expect(error.kind).toBe('auth');
    expect(calls).toHaveLength(0);
  });
});

describe('404 NO_ACTIVE_DEVICE', () => {
  const devices = json(200, {
    devices: [
      { id: 'pc', name: 'PC', type: 'Computer', is_active: false, is_restricted: false },
      { id: 'cel', name: 'Celular', type: 'Smartphone', is_active: false, is_restricted: false },
    ],
  });

  it('transfiere al dispositivo elegido y reintenta una vez', async () => {
    setPreferredDevice('cel');
    respond(spotifyError(404, 'NO_ACTIVE_DEVICE'), devices, empty(), empty());
    await play();

    expect(calls.map((c) => `${c.method} ${c.url.replace(API_URL, '')}`)).toEqual([
      'PUT /me/player/play',
      'GET /me/player/devices',
      'PUT /me/player',
      'PUT /me/player/play',
    ]);
    expect(JSON.parse(calls[2]!.body!)).toEqual({ device_ids: ['cel'], play: false });
  });

  it('sin preferido, usa el primero disponible', async () => {
    respond(spotifyError(404, 'NO_ACTIVE_DEVICE'), devices, empty(), empty());
    await next();
    expect(JSON.parse(calls[2]!.body!)).toEqual({ device_ids: ['pc'], play: false });
  });

  it('sin dispositivos, pide abrir Spotify', async () => {
    respond(spotifyError(404, 'NO_ACTIVE_DEVICE'), json(200, { devices: [] }));
    const error = await catchError(play());
    expect(error.kind).toBe('no-device');
    expect(error.message).toBe('Abrí Spotify en algún dispositivo.');
    expect(calls).toHaveLength(2);
  });

  it('si después de transferir sigue sin dispositivo, no reintenta de nuevo', async () => {
    respond(
      spotifyError(404, 'NO_ACTIVE_DEVICE'),
      devices,
      empty(),
      spotifyError(404, 'NO_ACTIVE_DEVICE'),
    );
    const error = await catchError(play());
    expect(error.kind).toBe('no-device');
    expect(calls).toHaveLength(4);
  });
});

describe('403', () => {
  it('PREMIUM_REQUIRED avisa y no reintenta', async () => {
    respond(spotifyError(403, 'PREMIUM_REQUIRED', 'Player command failed: Premium required'));
    const error = await catchError(play());
    expect(error.kind).toBe('premium');
    expect(error.message).toMatch(/Premium/);
    expect(calls).toHaveLength(1);
  });

  it('en volumen avisa que el dispositivo no lo permite', async () => {
    respond(
      json(200, {
        is_playing: true,
        device: { id: 'cel', volume_percent: 50, supports_volume: true },
        item: null,
      }),
      spotifyError(403, 'UNKNOWN', 'Cannot control device volume'),
    );
    const error = await catchError(changeVolume(1));
    expect(error.kind).toBe('volume-forbidden');
  });

  it('si el dispositivo declara que no soporta volumen, ni lo intenta', async () => {
    respond(
      json(200, {
        is_playing: true,
        device: { id: 'cel', volume_percent: null, supports_volume: false },
        item: null,
      }),
    );
    const error = await catchError(changeVolume(-1));
    expect(error.kind).toBe('volume-forbidden');
    expect(calls).toHaveLength(1);
  });
});

describe('volumen', () => {
  const state = (volume: number) =>
    json(200, {
      is_playing: true,
      device: { id: 'pc', volume_percent: volume, supports_volume: true },
      item: null,
    });

  it('sube de a 10', async () => {
    respond(state(55), empty());
    expect(await changeVolume(1)).toBe(65);
    expect(calls[1]!.url).toBe(`${API_URL}/me/player/volume?volume_percent=65`);
  });

  it('no pasa de 0 ni de 100', async () => {
    respond(state(95), empty(), state(4), empty());
    expect(await changeVolume(1)).toBe(100);
    expect(await changeVolume(-1)).toBe(0);
  });
});

describe('429', () => {
  it('respeta Retry-After y reintenta', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    respond(json(429, {}, { 'Retry-After': '2' }), empty());

    const done = play();
    await vi.advanceTimersByTimeAsync(1999);
    expect(calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(calls).toHaveLength(2);
  });

  it('si la espera es muy larga, avisa en lugar de quedar trabado', async () => {
    respond(json(429, {}, { 'Retry-After': '3600' }));
    const error = await catchError(play());
    expect(error.kind).toBe('rate-limited');
    expect(error.message).toContain('3600');
    expect(calls).toHaveLength(1);
  });
});

describe('errores de red', () => {
  it('avisa sin romper', async () => {
    respond(() => {
      throw new TypeError('Failed to fetch');
    });
    const error = await catchError(play());
    expect(error.kind).toBe('network');
  });

  it('un error de red al refrescar no cierra la sesión', async () => {
    loginWith('access-viejo', 0);
    respond(() => {
      throw new TypeError('Failed to fetch');
    });
    const error = await catchError(play());
    expect(error.kind).toBe('network');
    expect(localStorage.getItem('spotidvc.refreshToken')).toBe('refresh-1');
  });
});
