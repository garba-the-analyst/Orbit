/**
 * Minimal typed HTTP client.
 *
 * - Adds the bearer token from the session on every call.
 * - Turns every failure into an ApiError with a message that is safe to show a person.
 * - A 401 on an authenticated call clears the session (expired or suspended).
 */

const TOKEN_KEY = 'orbit.token';

/** The API address. In development the API runs on the same machine as the dev server, on port 4000. */
const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, '');
// An empty VITE_API_URL (for example from a Docker build argument left blank) means "not set".
export const API_URL: string = configuredApiUrl || `${window.location.protocol}//${window.location.hostname}:4000/api`;

/** Socket.IO lives at the API's origin (without the /api prefix). */
export const SOCKET_URL = API_URL.replace(/\/api$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const session = {
  get token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set token(value: string | null) {
    try {
      if (value) localStorage.setItem(TOKEN_KEY, value);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable (private mode): the session lasts until reload */
    }
  },
};

/** Called when the server says the session is no longer valid. Set by the auth store. */
let onUnauthorized: () => void = () => undefined;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

function messageFrom(body: unknown, status: number): string {
  const raw = (body as { message?: string | string[] } | null)?.message;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (first) return first.charAt(0).toUpperCase() + first.slice(1);
  if (status === 429) return 'Too many attempts. Wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our side. Try again in a moment.';
  return 'That did not work. Try again.';
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const token = session.token;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach ORBIT. Check your internet connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, messageFrom(data, res.status));
  }
  return data as T;
}

export const get = <T>(path: string) => request<T>('GET', path);
export const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);
export const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);
export const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
export const del = <T>(path: string) => request<T>('DELETE', path);
