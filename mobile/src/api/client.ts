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
    /** The server's error body, e.g. { code: 'PRICE_CHANGED', current: {...} }. */
    public readonly body: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
  get code(): string | null {
    return typeof this.body?.code === 'string' ? this.body.code : null;
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

async function send(method: string, path: string, body?: unknown, form?: FormData): Promise<Response> {
  const controller = new AbortController();
  // Uploads over a slow mobile connection get longer than ordinary calls.
  const timer = setTimeout(() => controller.abort(), form ? 90_000 : 20_000);
  const token = session.token;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach ORBIT. Check your internet connection and try again.');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, messageFrom(data, res.status), data && typeof data === 'object' ? (data as Record<string, unknown>) : null);
  }
  return res;
}

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await send(method, path, body);
  if (res.status === 204) return undefined as T;
  return (await res.json().catch(() => null)) as T;
}

/** A list endpoint that reports the full count in X-Total-Count, so screens can page. */
export async function getPage<T>(path: string): Promise<{ items: T[]; total: number }> {
  const res = await send('GET', path);
  const data = ((await res.json().catch(() => [])) as unknown) ?? [];
  const items = Array.isArray(data) ? (data as T[]) : ((data as { items?: T[] }).items ?? []);
  const total = Number(res.headers.get('X-Total-Count') ?? (data as { total?: number }).total ?? items.length);
  return { items, total };
}

/** Uploads one file as multipart form data under the "file" field. */
export async function upload<T>(path: string, file: Blob, filename = 'upload.jpg'): Promise<T> {
  const form = new FormData();
  form.append('file', file, filename);
  const res = await send('POST', path, undefined, form);
  return (await res.json()) as T;
}

/** Fetches a protected file (e.g. a private document, for an admin) as an object URL. */
export async function fileUrl(path: string): Promise<string> {
  const res = await send('GET', path);
  return URL.createObjectURL(await res.blob());
}

export const get = <T>(path: string) => request<T>('GET', path);
export const post = <T>(path: string, body: unknown = {}) => request<T>('POST', path, body);
export const patch = <T>(path: string, body: unknown) => request<T>('PATCH', path, body);
export const put = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
export const del = <T>(path: string) => request<T>('DELETE', path);
