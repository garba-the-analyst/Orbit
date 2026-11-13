/** Lets the demo backend push "realtime" signals without importing the socket module (avoids an import cycle). */
export const bus = {
  emit: (_event: string): void => undefined,
  courier: (_p: { orderId?: string; tripId?: string; lat: number; lng: number; heading: number | null }): void => undefined,
};
