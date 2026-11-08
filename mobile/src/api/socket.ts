/**
 * Realtime updates over Socket.IO.
 *
 * The server only sends tiny "something changed" signals (never personal data). Screens react by
 * re-fetching over the authenticated REST API. If the socket is down, screens still work: they refresh
 * whenever they are opened and on pull-to-refresh.
 *
 * Listeners are kept in a registry and re-attached whenever a new socket is created, so a screen that
 * mounted before sign-in (or across a sign-out and sign-in) still receives events.
 */
import { io, Socket } from 'socket.io-client';
import { onBeforeUnmount, onMounted } from 'vue';
import { SOCKET_URL } from './client';

export type LiveEvent = 'order.updated' | 'jobs.changed' | 'admin.changed' | 'account.updated' | 'connect';

let socket: Socket | null = null;
const registry = new Map<LiveEvent, Set<() => void>>();

export function connectSocket(token: string) {
  disconnectSocket();
  const s = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 8000,
  });
  for (const [event, handlers] of registry) for (const fn of handlers) s.on(event, fn);
  socket = s;
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

/** Subscribes to an event for as long as the returned function has not been called. */
export function subscribe(event: LiveEvent, fn: () => void): () => void {
  if (!registry.has(event)) registry.set(event, new Set());
  registry.get(event)!.add(fn);
  socket?.on(event, fn);
  return () => {
    registry.get(event)?.delete(fn);
    socket?.off(event, fn);
  };
}

/**
 * Runs `handler` whenever one of the events arrives while the component is mounted.
 * A burst of events causes a single refresh. 'connect' fires on every (re)connection,
 * which re-syncs a screen after the network dropped.
 */
export function useLive(events: LiveEvent[], handler: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const fire = () => {
    clearTimeout(timer);
    timer = setTimeout(handler, 250);
  };
  let stops: Array<() => void> = [];

  onMounted(() => {
    stops = [...events, 'connect' as const].map((e) => subscribe(e, fire));
  });
  onBeforeUnmount(() => {
    clearTimeout(timer);
    stops.forEach((stop) => stop());
    stops = [];
  });
}
