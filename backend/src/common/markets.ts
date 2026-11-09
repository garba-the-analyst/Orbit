/**
 * Markets: the countries ORBIT operates in.
 *
 * A market bundles everything that differs by country: currency, phone format, default map centre, and how
 * the Nigerian base tariffs scale. Adding a country means adding one entry here and enabling it with
 * ENABLED_MARKETS. Nothing else in the code is Nigeria-specific.
 *
 * Amounts are whole units of the market's currency (whole naira, whole cedi, whole shilling). Every money-bearing
 * record also stores its currency, so moving to minor units (kobo, pesewas) later needs no schema change.
 *
 * IMPORTANT: the tariff scales for markets other than Nigeria are placeholders derived from rough exchange rates.
 * Review them with local operators before launching in a new country.
 */
export interface Market {
  /** ISO 3166-1 alpha-2 country code. */
  code: string;
  name: string;
  /** ISO 4217 currency code. */
  currency: string;
  symbol: string;
  /** International dialling prefix, with the plus. */
  dialCode: string;
  /** BCP 47 locale for number formatting. */
  locale: string;
  /** Where the map opens when we do not know where the person is: a central, well-known city. */
  center: { lat: number; lng: number };
  centerName: string;
  /** Rough bounding box [south, west, north, east]. Used to tell which market a coordinate belongs to. */
  bbox: [number, number, number, number];
  /** Multiplier applied to the Nigerian (naira) base tariffs. */
  tariffScale: number;
  /** Fares are rounded up to a multiple of this many currency units. */
  fareRounding: number;
  /** The smallest sensible cancellation fee, in currency units. */
  cancelFee: number;
  /** Minutes ahead of UTC (none of these markets use daylight saving). Used to find "today". */
  utcOffsetMin: number;
}

export const MARKETS: Record<string, Market> = {
  NG: {
    code: 'NG', name: 'Nigeria', currency: 'NGN', symbol: '₦', dialCode: '+234', locale: 'en-NG',
    center: { lat: 9.0765, lng: 7.3986 }, centerName: 'Abuja',
    bbox: [4.2, 2.6, 13.9, 14.7], tariffScale: 1, fareRounding: 10, cancelFee: 200, utcOffsetMin: 60,
  },
  GH: {
    code: 'GH', name: 'Ghana', currency: 'GHS', symbol: 'GH₵', dialCode: '+233', locale: 'en-GH',
    center: { lat: 5.6037, lng: -0.187 }, centerName: 'Accra',
    bbox: [4.7, -3.3, 11.2, 1.2], tariffScale: 0.012, fareRounding: 1, cancelFee: 3, utcOffsetMin: 0,
  },
  KE: {
    code: 'KE', name: 'Kenya', currency: 'KES', symbol: 'KSh', dialCode: '+254', locale: 'en-KE',
    center: { lat: -1.2921, lng: 36.8219 }, centerName: 'Nairobi',
    bbox: [-4.8, 33.9, 5.1, 41.9], tariffScale: 0.09, fareRounding: 5, cancelFee: 50, utcOffsetMin: 180,
  },
  ZA: {
    code: 'ZA', name: 'South Africa', currency: 'ZAR', symbol: 'R', dialCode: '+27', locale: 'en-ZA',
    center: { lat: -26.2041, lng: 28.0473 }, centerName: 'Johannesburg',
    bbox: [-34.9, 16.3, -22.1, 32.9], tariffScale: 0.014, fareRounding: 1, cancelFee: 15, utcOffsetMin: 120,
  },
};

export const DEFAULT_MARKET = 'NG';

export const marketOf = (code: string): Market => MARKETS[code] ?? MARKETS[DEFAULT_MARKET];

/** Great-circle distance between two points, in metres. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Which of the given markets a point is in. Bounding boxes overlap slightly at borders, so if several match we
 * take the one whose centre is nearest. Returns null when the point is outside every enabled market.
 */
export function marketAt(point: { lat: number; lng: number }, enabled: string[]): Market | null {
  const inside = enabled
    .map((c) => MARKETS[c])
    .filter((m): m is Market => !!m)
    .filter((m) => point.lat >= m.bbox[0] && point.lat <= m.bbox[2] && point.lng >= m.bbox[1] && point.lng <= m.bbox[3]);
  if (inside.length === 0) return null;
  return inside.sort((x, y) => haversineM(point, x.center) - haversineM(point, y.center))[0];
}
