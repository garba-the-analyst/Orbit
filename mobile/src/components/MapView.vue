<script setup lang="ts">
/**
 * An OpenStreetMap (Leaflet) map used everywhere in ORBIT: booking, tracking, the driver's job view and pickers.
 * Markers are plain data (kind + position); the route is a list of [lat, lng]. A moving marker glides between
 * positions instead of jumping. In dark mode the tiles are tinted via the --map-tiles-filter token.
 */
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { LatLng } from '../api/types';

export interface MapMarker extends LatLng {
  id: string;
  kind: 'pickup' | 'drop' | 'driver' | 'me' | 'shop' | 'stop';
  label?: string;
  heading?: number | null;
  vehicle?: string;
}

const props = withDefaults(
  defineProps<{
    center: LatLng;
    zoom?: number;
    markers?: MapMarker[];
    route?: Array<[number, number]> | null;
    /** Fit everything (markers + route) in view whenever they change. */
    fit?: boolean;
    /** Extra space (px) the fit must leave at the bottom, for a sheet that covers part of the map. */
    bottomPad?: number;
    /** A fixed pin in the middle; the map moves under it and reports where it ended up. */
    pickMode?: boolean;
    interactive?: boolean;
    tileUrl: string;
    attribution?: string;
  }>(),
  { zoom: 14, markers: () => [], route: null, fit: true, bottomPad: 0, pickMode: false, interactive: true, attribution: '© OpenStreetMap contributors' },
);
const emit = defineEmits<{ (e: 'moved', p: LatLng): void; (e: 'ready'): void }>();

const host = ref<HTMLDivElement>();
let map: L.Map | null = null;
let routeLine: L.Polyline | null = null;
let routeGlow: L.Polyline | null = null;
const pins = new Map<string, L.Marker>();
let ro: ResizeObserver | null = null;

const SVG = {
  pickup: '<svg viewBox="0 0 24 24" width="30" height="30"><circle cx="12" cy="12" r="9" fill="#ffc400" stroke="#161a52" stroke-width="3"/><circle cx="12" cy="12" r="3" fill="#161a52"/></svg>',
  drop: '<svg viewBox="0 0 24 32" width="28" height="36"><path d="M12 31s10-9.6 10-19A10 10 0 0 0 2 12c0 9.4 10 19 10 19z" fill="#161a52" stroke="#fff" stroke-width="2"/><rect x="8" y="8" width="8" height="8" rx="1.5" fill="#ffc400"/></svg>',
  shop: '<svg viewBox="0 0 24 24" width="30" height="30"><rect x="2" y="2" width="20" height="20" rx="6" fill="#161a52" stroke="#fff" stroke-width="2"/><path d="M6 10h12l-1-4H7zM7 10v7h10v-7" fill="none" stroke="#ffc400" stroke-width="1.8"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="7" fill="#fff" stroke="#161a52" stroke-width="3"/></svg>',
  me: '<span class="me-dot"></span>',
  driver:
    '<svg viewBox="0 0 40 40" width="40" height="40" class="arrow"><circle cx="20" cy="20" r="17" fill="#161a52" stroke="#fff" stroke-width="3"/><path d="M20 9l7 17-7-4-7 4z" fill="#ffc400"/></svg>',
} as const;

function iconFor(m: MapMarker): L.DivIcon {
  const size = m.kind === 'driver' ? 40 : m.kind === 'drop' ? 36 : m.kind === 'me' ? 18 : 30;
  const anchor: [number, number] = m.kind === 'drop' ? [size * 0.39, size] : [size / 2, size / 2];
  return L.divIcon({
    className: `orbit-pin pin-${m.kind}`,
    html: `<div class="pin-in" style="transform:rotate(${m.kind === 'driver' ? (m.heading ?? 0) : 0}deg)">${SVG[m.kind]}</div>${m.label ? `<span class="pin-label">${m.label.replace(/</g, '&lt;')}</span>` : ''}`,
    iconSize: [size, size],
    iconAnchor: anchor,
  });
}

function syncMarkers() {
  if (!map) return;
  const keep = new Set(props.markers.map((m) => m.id));
  for (const [id, pin] of pins) if (!keep.has(id)) (pin.remove(), pins.delete(id));
  for (const m of props.markers) {
    const existing = pins.get(m.id);
    if (existing) {
      existing.setLatLng([m.lat, m.lng]);
      existing.setIcon(iconFor(m));
    } else {
      const pin = L.marker([m.lat, m.lng], { icon: iconFor(m), interactive: false, keyboard: false, zIndexOffset: m.kind === 'driver' ? 1000 : 0 }).addTo(map);
      pins.set(m.id, pin);
    }
  }
}

function syncRoute() {
  if (!map) return;
  routeLine?.remove();
  routeGlow?.remove();
  routeLine = routeGlow = null;
  if (props.route && props.route.length > 1) {
    routeGlow = L.polyline(props.route, { color: '#ffc400', weight: 11, opacity: 0.35, lineCap: 'round', lineJoin: 'round', className: 'route-glow' }).addTo(map);
    routeLine = L.polyline(props.route, { color: '#161a52', weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round', className: 'route-line' }).addTo(map);
  }
}

function fitAll(animate = true) {
  if (!map) return;
  const pts: L.LatLngExpression[] = props.markers.map((m) => [m.lat, m.lng]);
  if (props.route?.length) pts.push(...(props.route as L.LatLngExpression[]));
  if (!pts.length) return;
  if (pts.length === 1) return void map.setView(pts[0], Math.max(map.getZoom(), props.zoom), { animate });
  map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [36, 36], paddingBottomRight: [36, 36 + props.bottomPad], maxZoom: 17, animate });
}

onMounted(() => {
  map = L.map(host.value!, {
    center: [props.center.lat, props.center.lng],
    zoom: props.zoom,
    zoomControl: false,
    attributionControl: false,
    dragging: props.interactive,
    scrollWheelZoom: props.interactive,
    touchZoom: props.interactive,
    doubleClickZoom: props.interactive,
    boxZoom: false,
    keyboard: false,
  });
  L.tileLayer(props.tileUrl, { maxZoom: 19, crossOrigin: true }).addTo(map);
  L.control.attribution({ prefix: false, position: 'bottomleft' }).addAttribution(props.attribution).addTo(map);
  map.on('moveend', () => {
    if (props.pickMode && map) {
      const c = map.getCenter();
      emit('moved', { lat: c.lat, lng: c.lng });
    }
  });
  syncRoute();
  syncMarkers();
  if (props.fit) fitAll(false);
  // Ionic pages are laid out after mount; keep Leaflet's idea of its size correct.
  ro = new ResizeObserver(() => map?.invalidateSize());
  ro.observe(host.value!);
  setTimeout(() => map?.invalidateSize(), 250);
  emit('ready');
});

onBeforeUnmount(() => {
  ro?.disconnect();
  map?.remove();
  map = null;
  pins.clear();
});

watch(() => props.markers, () => {
  syncMarkers();
}, { deep: true });
watch(() => props.route, () => {
  syncRoute();
  if (props.fit) fitAll();
});
watch(() => [props.markers.map((m) => m.kind !== 'driver' && m.kind !== 'me' ? `${m.id}${m.lat}${m.lng}` : '').join(), props.bottomPad], () => {
  if (props.fit) fitAll();
});

defineExpose({
  flyTo(p: LatLng, zoom = 16) {
    map?.flyTo([p.lat, p.lng], zoom, { duration: 0.8 });
  },
  setView(p: LatLng, zoom?: number) {
    map?.setView([p.lat, p.lng], zoom ?? map.getZoom(), { animate: false });
  },
  fit: () => fitAll(),
  center: (): LatLng | null => (map ? { lat: map.getCenter().lat, lng: map.getCenter().lng } : null),
});
</script>

<template>
  <div class="map-wrap">
    <div ref="host" class="map"></div>
    <div v-if="pickMode" class="center-pin" aria-hidden="true">
      <svg viewBox="0 0 24 32" width="36" height="46"><path d="M12 31s10-9.6 10-19A10 10 0 0 0 2 12c0 9.4 10 19 10 19z" fill="#161a52" stroke="#fff" stroke-width="2" /><circle cx="12" cy="12" r="4" fill="#ffc400" /></svg>
      <span class="shadow"></span>
    </div>
  </div>
</template>

<style>
/* Unscoped on purpose: Leaflet creates these elements itself. */
.map-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 200px;
  background: var(--ink-wash);
}
.map {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--ink-wash);
  font-family: var(--font-body);
}
.map .leaflet-tile-pane {
  filter: var(--map-tiles-filter);
}
.map .leaflet-control-attribution {
  background: color-mix(in srgb, var(--surface) 80%, transparent);
  color: var(--slate);
  font-size: 10px;
  border-radius: 6px;
  margin: 0 0 4px 4px;
}
.map .leaflet-control-attribution a {
  color: var(--slate);
}
.orbit-pin {
  background: none;
  border: 0;
}
.orbit-pin .pin-in {
  transition: transform 0.6s linear;
  filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.35));
}
.orbit-pin.pin-driver {
  transition: transform 1s linear;
}
.me-dot {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #2f7df6;
  border: 3px solid #fff;
  box-shadow: 0 0 0 0 rgba(47, 125, 246, 0.5);
  animation: me-pulse 2s ease-out infinite;
}
@keyframes me-pulse {
  to {
    box-shadow: 0 0 0 16px rgba(47, 125, 246, 0);
  }
}
.pin-label {
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  margin-top: 2px;
  padding: 2px 8px;
  border-radius: 8px;
  background: var(--surface);
  color: var(--ink);
  font: 600 11px var(--font-display);
  white-space: nowrap;
  box-shadow: var(--shadow-sm);
}
.route-line {
  stroke-dasharray: 2000;
  animation: route-draw 1.1s var(--ease) both;
}
:root[data-theme='dark'] .route-line {
  stroke: #e8eaff;
}
@keyframes route-draw {
  from {
    stroke-dashoffset: 2000;
  }
  to {
    stroke-dashoffset: 0;
  }
}
.center-pin {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 500;
  transform: translate(-50%, -100%);
  pointer-events: none;
  animation: pin-bob 1.6s ease-in-out infinite;
}
.center-pin .shadow {
  position: absolute;
  left: 50%;
  bottom: -3px;
  width: 14px;
  height: 5px;
  margin-left: -7px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.3);
}
@keyframes pin-bob {
  50% {
    transform: translate(-50%, calc(-100% - 4px));
  }
}
</style>
