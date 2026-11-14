/**
 * Client-side error logger.
 *
 * Captures uncaught JavaScript errors and unhandled promise rejections, then
 * sends them to the backend /api/error-logs endpoint so admins can review them
 * in the Error Logs admin screen.
 *
 * Call initErrorLogging() once from main.ts after the app is created.
 */
import { api } from '../api/endpoints';

let initialized = false;

export function initErrorLogging() {
  if (initialized) return;
  initialized = true;

  // Capture uncaught JavaScript errors
  window.addEventListener('error', (event) => {
    void reportError({
      path: window.location.pathname,
      method: 'CLIENT',
      message: event.message ?? 'Unknown error',
      stack: event.error?.stack ?? undefined,
      userAgent: navigator.userAgent,
    });
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason ?? event;
    const message = reason?.message ?? String(reason ?? 'Unknown rejection');
    const stack = reason?.stack ?? undefined;
    void reportError({
      path: window.location.pathname,
      method: 'CLIENT',
      message,
      stack,
      userAgent: navigator.userAgent,
    });
  });
}

const queue: Array<() => Promise<void>> = [];
let processing = false;

async function processQueue() {
  if (processing) return;
  processing = true;
  while (queue.length) {
    const fn = queue.shift();
    if (fn) await fn();
  }
  processing = false;
}

export async function reportError(payload: {
  path: string;
  method: string;
  message: string;
  stack?: string;
  userAgent?: string;
  userId?: string | null;
  role?: string | null;
}) {
  queue.push(async () => {
    try {
      await (api.reportError as any)(payload);
    } catch {
      // Silently ignore - we don't want error reporting to cause more errors
    }
  });
  void processQueue();
}
