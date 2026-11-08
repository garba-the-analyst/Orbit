/**
 * Client-side form checks. They mirror the server's rules so people get instant, specific feedback;
 * the server still validates everything, so these are a convenience, not a security boundary.
 */

export const NG_PHONE = /^(\+234|0)[789][01]\d{8}$/;

export const cleanPhone = (v: string) => v.replace(/[\s-]/g, '');

export function emailError(v: string): string | null {
  const s = v.trim();
  if (!s) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return 'Enter a valid email, like name@example.com.';
  return null;
}

export function passwordError(v: string): string | null {
  if (!v) return 'Enter a password.';
  if (v.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) return 'Include at least one letter and one number.';
  return null;
}

export function phoneError(v: string): string | null {
  if (!v.trim()) return 'Enter your phone number.';
  if (!NG_PHONE.test(cleanPhone(v))) return 'Enter a valid Nigerian number, like 08031234567.';
  return null;
}

export function nameError(v: string, what = 'your name'): string | null {
  const s = v.trim();
  if (s.length < 2) return `Enter ${what}.`;
  if (s.length > 80) return 'That is too long. Use 80 characters or fewer.';
  return null;
}

export function addressError(v: string): string | null {
  const s = v.trim();
  if (s.length < 5) return 'Say where to deliver, like “Hostel A, Room 12”.';
  if (s.length > 240) return 'That is too long. Use 240 characters or fewer.';
  return null;
}

/** Parses a whole-naira amount typed by a person ("2,800" or "2800"). Returns null if invalid. */
export function parseNaira(v: string): number | null {
  const s = v.replace(/[,\s₦]/g, '');
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}
