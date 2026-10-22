const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
export const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SCOPES = 'user-modify-playback-state user-read-playback-state';

const KEYS = {
  access: 'spotidvc.accessToken',
  refresh: 'spotidvc.refreshToken',
  expiresAt: 'spotidvc.expiresAt',
  verifier: 'spotidvc.pkceVerifier',
  state: 'spotidvc.pkceState',
} as const;

/** Refrescar un minuto antes del vencimiento. */
const REFRESH_MARGIN_MS = 60_000;

export class AuthError extends Error {}

function clientId(): string {
  const id = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined;
  if (!id) throw new AuthError('Falta configurar VITE_SPOTIFY_CLIENT_ID en el archivo .env');
  return id;
}

export function redirectUri(): string {
  const configured = import.meta.env.VITE_REDIRECT_URI as string | undefined;
  return configured || location.origin + import.meta.env.BASE_URL;
}

function randomString(bytes: number): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return base64Url(data);
}

function base64Url(data: Uint8Array): string {
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

function saveTokens(tokens: TokenResponse): void {
  localStorage.setItem(KEYS.access, tokens.access_token);
  if (tokens.refresh_token) localStorage.setItem(KEYS.refresh, tokens.refresh_token);
  localStorage.setItem(KEYS.expiresAt, String(Date.now() + tokens.expires_in * 1000));
}

let authLostListener: (() => void) | null = null;

/** Se llama cuando la sesión no se puede recuperar y hay que volver a mostrar el login. */
export function onAuthLost(listener: () => void): void {
  authLostListener = listener;
}

export function isLoggedIn(): boolean {
  return localStorage.getItem(KEYS.refresh) !== null;
}

export async function login(): Promise<void> {
  const verifier = randomString(64);
  const state = randomString(16);
  localStorage.setItem(KEYS.verifier, verifier);
  localStorage.setItem(KEYS.state, state);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(),
    scope: SCOPES,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: await challengeFor(verifier),
    state,
  });
  location.assign(`${AUTHORIZE_URL}?${params}`);
}

/**
 * Si la URL trae la respuesta de Spotify (?code= o ?error=), canjea el código por tokens
 * y limpia la URL. Devuelve null si no había callback que procesar.
 */
export async function handleCallback(): Promise<
  { ok: true } | { ok: false; message: string } | null
> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const error = params.get('error');
  if (!code && !error) return null;

  history.replaceState(null, '', location.pathname);
  const verifier = localStorage.getItem(KEYS.verifier);
  const expectedState = localStorage.getItem(KEYS.state);
  localStorage.removeItem(KEYS.verifier);
  localStorage.removeItem(KEYS.state);

  if (error) {
    return {
      ok: false,
      message:
        error === 'access_denied'
          ? 'Cancelaste el acceso a Spotify.'
          : `Spotify respondió: ${error}`,
    };
  }
  if (!verifier || params.get('state') !== expectedState) {
    return {
      ok: false,
      message: 'La respuesta de Spotify no coincide con el login. Probá de nuevo.',
    };
  }

  try {
    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code!,
        redirect_uri: redirectUri(),
        client_id: clientId(),
        code_verifier: verifier,
      }),
    });
    if (!response.ok) {
      return { ok: false, message: `No se pudo completar el login (${response.status}).` };
    }
    saveTokens((await response.json()) as TokenResponse);
    return { ok: true };
  } catch {
    return { ok: false, message: 'Sin conexión: no se pudo completar el login.' };
  }
}

let refreshing: Promise<boolean> | null = null;

/** Pide un access token nuevo. Si Spotify lo rechaza, cierra la sesión. */
export function refreshToken(): Promise<boolean> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<boolean> {
  const refresh = localStorage.getItem(KEYS.refresh);
  if (!refresh) return false;

  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: clientId(),
      }),
    });
  } catch {
    // Error de red: la sesión sigue siendo válida, solo no se pudo refrescar ahora.
    throw new TypeError('network');
  }

  if (!response.ok) {
    logout();
    authLostListener?.();
    return false;
  }
  saveTokens((await response.json()) as TokenResponse);
  return true;
}

/** Access token vigente, refrescándolo si vence en menos de un minuto. Null si no hay sesión. */
export async function getAccessToken(): Promise<string | null> {
  if (!isLoggedIn()) return null;
  const expiresAt = Number(localStorage.getItem(KEYS.expiresAt) ?? 0);
  if (Date.now() > expiresAt - REFRESH_MARGIN_MS) {
    if (!(await refreshToken())) return null;
  }
  return localStorage.getItem(KEYS.access);
}

export function logout(): void {
  localStorage.removeItem(KEYS.access);
  localStorage.removeItem(KEYS.refresh);
  localStorage.removeItem(KEYS.expiresAt);
}
