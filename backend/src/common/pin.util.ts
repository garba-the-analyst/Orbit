/**
 * Delivery PIN helpers (proposal section 4.2: "confirm receipt using a delivery PIN").
 *
 * The PIN is derived, not stored: HMAC-SHA256(PIN_SECRET, orderId) reduced to four digits.
 * - The server can always re-display it to the customer who owns the order.
 * - A leaked database dump does not reveal any PIN without the server secret.
 * - Verification uses a constant-time comparison.
 * Brute-force is limited separately by an attempt counter on the order (5 tries, then locked).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export function derivePin(orderId: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(orderId).digest();
  return String(digest.readUInt32BE(0) % 10_000).padStart(4, '0');
}

export function pinMatches(expected: string, supplied: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Verifies the HMAC-SHA256 hex signature of a webhook body in constant time. */
export function signatureMatches(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
