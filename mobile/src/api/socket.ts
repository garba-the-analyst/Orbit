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
import { DEMO } from './demo/flag';
import { bus } from './demo/bus';

export type LiveEvent =
  | 'order.updated'
  | 'trip.updated'
  | 'offers.changed'
  | 'jobs.changed'
  | 'admin.changed'
  | 'account.updated'
  | 'notification.new'
  | 'connect';

/** A live position from the driver you are riding with. The one event that carries data rather than a signal. */
export interface CourierMoved {
  orderId?: string;
  tripId?: string;
  lat: number;
  lng: number;
  heading: number | null;
}

/** Subscribes to driver positions. Returns an unsubscribe function. */
export function onCourierMoved(fn: (p: CourierMoved) => void): () => void {
  courierHandlers.add(fn);
  socket?.on('courier.moved', fn);
  return () => {
    courierHandlers.delete(fn);
    socket?.off('courier.moved', fn);
  };
}

let socket: Socket | null = null;
const registry = new Map<LiveEvent, Set<() => void>>();
const courierHandlers = new Set<(p: CourierMoved) => void>();

export function connectSocket(token: string) {
  disconnectSocket();
  if (DEMO) return; // the demo backend signals through `bus` instead of a socket
  const s = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionDelayMax: 8000,
  });
  for (const [event, handlers] of registry) for (const fn of handlers) s.on(event, fn);
  for (const fn of courierHandlers) s.on('courier.moved', fn);
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

// Demo mode: the fake backend's "realtime" signals reach screens through the same registries a socket would use.
if (DEMO) {
  bus.emit = (event: string) => registry.get(event as LiveEvent)?.forEach((fn) => fn());
  bus.courier = (p) => courierHandlers.forEach((fn) => fn({ ...p, heading: p.heading ?? null }));
}
