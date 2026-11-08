/** Display formatting. Nigerian conventions: ₦ with thousands separators, Lagos time (UTC+1, no DST). */

const nf = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

/** 7100 -> "₦7,100" */
export const naira = (amount: number | null | undefined): string =>
  amount === null || amount === undefined ? '–' : `₦${nf.format(amount)}`;

const LAGOS_OFFSET_MS = 3_600_000;
const lagos = (iso: string) => new Date(new Date(iso).getTime() + LAGOS_OFFSET_MS);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2:41 pm" */
export function clock(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = lagos(iso);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

/** "Today, 2:41 pm" / "Yesterday, 9:05 am" / "3 Nov, 4:10 pm" */
export function when(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return '';
  const d = lagos(iso);
  const n = new Date(now.getTime() + LAGOS_OFFSET_MS);
  const dayKey = (x: Date) => Math.floor(x.getTime() / 86_400_000);
  const diff = dayKey(n) - dayKey(d);
  const day =
    diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return `${day}, ${clock(iso)}`;
}

/** Short weekday for chart labels: "Mon". `date` is YYYY-MM-DD. */
export function weekday(date: string): string {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(`${date}T12:00:00Z`).getUTCDay()];
}

/** Minutes from now until `iso`, floored at 0. */
export function minutesUntil(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 60_000));
}

/** "1 item" / "3 items" */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** First name for greetings. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** Initials for a monogram, max two letters. Skips possessive and punctuation. */
export function monogram(name: string): string {
  const words = name.replace(/[’'`]s\b/g, '').split(/[\s\-–]+/).filter((w) => /[A-Za-z0-9]/.test(w));
  return (words[0]?.[0] ?? '?').toUpperCase() + (words[1]?.[0] ?? '').toUpperCase();
}

/** Black or white ink, whichever reads better on a given background hex. */
export function inkOn(hex: string): '#161a52' | '#ffffff' {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.4 ? '#161a52' : '#ffffff';
}

export const VEHICLE_LABEL: Record<string, string> = {
  MOTORCYCLE: 'Motorcycle',
  BICYCLE: 'Bicycle',
  KEKE: 'Keke',
};
