/** Device location, with graceful handling of "no permission" and "no GPS". */
import { Geolocation } from '@capacitor/geolocation';
import type { LatLng } from '../api/types';

export interface Fix extends LatLng {
  heading: number | null;
  accuracy: number | null;
}

const toFix = (p: GeolocationPosition | { coords: { latitude: number; longitude: number; heading?: number | null; accuracy?: number } }): Fix => ({
  lat: p.coords.latitude,
  lng: p.coords.longitude,
  heading: typeof p.coords.heading === 'number' && !Number.isNaN(p.coords.heading) ? p.coords.heading : null,
  accuracy: p.coords.accuracy ?? null,
});

/** One position fix, or null when the person says no or the device cannot tell. */
export async function currentPosition(timeoutMs = 10_000): Promise<Fix | null> {
  try {
    return toFix(await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15_000 }));
  } catch {
    return null;
  }
}

/** Follows the device. Returns a function that stops. */
export async function watchPosition(onFix: (f: Fix) => void, onError?: () => void): Promise<() => void> {
  try {
    const id = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 20_000, maximumAge: 5_000 }, (pos, err) => {
      if (pos) onFix(toFix(pos));
      else if (err) onError?.();
    });
    return () => {
      Geolocation.clearWatch({ id }).catch(() => undefined);
    };
  } catch {
    onError?.();
    return () => undefined;
  }
}

/** Great-circle distance in metres. */
export function metresBetween(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Opens turn-by-turn navigation in the phone's maps app (Google Maps on Android, Apple Maps on iOS). */
export function openNavigation(to: LatLng) {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const url = ios ? `https://maps.apple.com/?daddr=${to.lat},${to.lng}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}&travelmode=driving`;
  window.open(url, '_system');
}
