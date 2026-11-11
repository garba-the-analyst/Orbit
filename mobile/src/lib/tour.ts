/**
 * Guided walkthroughs (driver.js). Each role has a short tour of the screen it lands on. Tours start by
 * themselves the first time (remembered on this device) and can be replayed from Account → "Take the tour".
 * Steps point at elements marked with data-tour="name"; a step whose element is missing is skipped.
 */
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

export type TourName = 'customer' | 'merchant' | 'driver' | 'admin';

const el = (name: string) => `[data-tour="${name}"]`;

const TOURS: Record<TourName, DriveStep[]> = {
  customer: [
    { popover: { title: 'Welcome to ORBIT', description: 'Rides, parcel delivery, freight and local shops in one app. This 30-second tour shows you around.' } },
    { element: el('book-ride'), popover: { title: 'Book a ride', description: 'Pick a bike, keke or car. You see the fare up front and can follow your driver live.' } },
    { element: el('book-parcel'), popover: { title: 'Send a parcel', description: 'Food, documents, fragile or perishable goods. Tell us what you are sending and a rider is matched.' } },
    { element: el('book-freight'), popover: { title: 'Move heavy goods', description: 'Vans, trucks and long-haul lorries for bulk loads, house moves and cargo.' } },
    { element: el('shops'), popover: { title: 'Shop local', description: 'Order from nearby shops and choose who delivers: the shop’s own rider or an ORBIT rider.' } },
    { element: el('bell'), popover: { title: 'Notifications', description: 'Driver found, order ready, trip updates. They arrive here the moment they happen.' } },
    { element: el('theme'), popover: { title: 'Dark mode', description: 'Easier on the eyes at night. It follows your phone unless you choose.' } },
  ],
  merchant: [
    { popover: { title: 'Your shop on ORBIT', description: 'Take orders, manage your catalogue and your own riders. Let’s look around.' } },
    { element: el('orders'), popover: { title: 'Orders', description: 'New orders appear here instantly. Accept, mark ready, then dispatch with one of your own riders or an ORBIT rider.' } },
    { element: el('catalogue'), popover: { title: 'Catalogue', description: 'Add goods and services with photos, full descriptions and dimensions, and mark food or perishables.' } },
    { element: el('riders'), popover: { title: 'Your riders', description: 'Invite your own riders by phone or email. They get your shop’s jobs first.' } },
    { element: el('shop-and-ride'), popover: { title: 'Shop and ride too', description: 'Everything a customer can do, you can do: book rides, send parcels and buy from other shops.' } },
  ],
  driver: [
    { popover: { title: 'Welcome, driver', description: 'Go online to receive ride, parcel and freight requests near you.' } },
    { element: el('online'), popover: { title: 'Go online', description: 'Switch this on when you are ready. Requests appear with a countdown; accept the ones you want.' } },
    { element: el('offers'), popover: { title: 'Requests', description: 'You see the pickup, the drop-off and exactly what you will earn before you accept.' } },
    { element: el('garage'), popover: { title: 'Vehicles and documents', description: 'Add your vehicle and upload your documents. Once approved you can take trips.' } },
    { element: el('earnings'), popover: { title: 'Earnings', description: 'Card trips are paid to your balance. Cash trips you collect yourself.' } },
  ],
  admin: [
    { popover: { title: 'ORBIT control room', description: 'Verify people, watch trips live and respond to safety alerts.' } },
    { element: el('queue'), popover: { title: 'Verification', description: 'Review documents and vehicles, then approve or reject.' } },
    { element: el('safety'), popover: { title: 'Safety alerts', description: 'SOS alerts from trips land here first.' } },
    { element: el('kpis'), popover: { title: 'Numbers', description: 'Marketplace, logistics and mobility KPIs at a glance.' } },
  ],
};

const key = (n: TourName) => `orbit.tour.${n}`;
const seen = (n: TourName) => {
  try {
    return localStorage.getItem(key(n)) === '1';
  } catch {
    return true;
  }
};
const mark = (n: TourName) => {
  try {
    localStorage.setItem(key(n), '1');
  } catch {
    /* fine */
  }
};

export function startTour(name: TourName) {
  const steps = TOURS[name].filter((s) => !s.element || document.querySelector(s.element as string));
  if (!steps.length) return;
  const d = driver({
    showProgress: true,
    animate: true,
    overlayOpacity: 0.7,
    popoverClass: 'orbit-tour',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Got it',
    steps,
    onDestroyed: () => mark(name),
  });
  d.drive();
}

/** Runs the tour once per device, a moment after the screen settles. */
export function autoTour(name: TourName, delay = 1200) {
  if (seen(name)) return;
  setTimeout(() => {
    if (!seen(name)) startTour(name);
  }, delay);
}

export function resetTours() {
  (['customer', 'merchant', 'driver', 'admin'] as TourName[]).forEach((n) => {
    try {
      localStorage.removeItem(key(n));
    } catch {
      /* fine */
    }
  });
}
