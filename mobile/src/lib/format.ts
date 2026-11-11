/**
 * Display formatting for every market ORBIT serves: the currency symbol, thousands separators, and times in the
 * person's own time zone (Lagos, UTC+1, until the app starts and switches to the device's zone).
 */

const nf = new Intl.NumberFormat('en-NG', { maximumFractionDigits: 0 });

const SYMBOL: Record<string, string> = { NGN: '₦', GHS: 'GH₵', KES: 'KSh', ZAR: 'R' };

/** 7100, 'NGN' -> "₦7,100"; 120, 'GHS' -> "GH₵120". Whole units: ORBIT does not show fractions. */
export const money = (amount: number | null | undefined, currency = 'NGN'): string =>
  amount === null || amount === undefined ? '–' : `${amount < 0 ? '−' : ''}${SYMBOL[currency] ?? `${currency} `}${nf.format(Math.abs(amount))}`;

/** 7100 -> "₦7,100" (the default currency; kept for screens that only ever show naira). */
let defaultCurrency = 'NGN';
export const setDefaultCurrency = (c: string) => (defaultCurrency = c);
export const naira = (amount: number | null | undefined): string => money(amount, defaultCurrency);

let offsetMs = 3_600_000;
/** Switches times to the device's own zone. Called once at startup; tests keep the Lagos default. */
export function useDeviceTimezone() {
  offsetMs = -new Date().getTimezoneOffset() * 60_000;
}
const lagos = (iso: string) => new Date(new Date(iso).getTime() + offsetMs);

/** 1830 -> "1.8 km", 640 -> "640 m" */
export function distance(m: number | null | undefined): string {
  if (m === null || m === undefined) return '–';
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/** 2700 -> "45 min", 5400 -> "1 h 30 min" */
export function duration(s: number | null | undefined): string {
  if (s === null || s === undefined) return '–';
  const min = Math.max(1, Math.round(s / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

/** "2 min ago", "3 h ago", "Yesterday", "4 Nov" */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return when(iso, new Date(now)).split(',')[0];
}

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
  const n = new Date(now.getTime() + offsetMs);
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
  BICYCLE: 'Bicycle',
  MOTORCYCLE: 'Motorcycle',
  KEKE: 'Keke (tricycle)',
  CAR: 'Car',
  VAN: 'Van',
  TRUCK: 'Truck',
  LORRY: 'Lorry',
  LONG_HAUL: 'Long-haul truck',
};

/** Light vehicles carry people and parcels around town; heavy ones haul freight. */
export const LIGHT_VEHICLES = ['BICYCLE', 'MOTORCYCLE', 'KEKE', 'CAR'] as const;
export const HEAVY_VEHICLES = ['VAN', 'TRUCK', 'LORRY', 'LONG_HAUL'] as const;
