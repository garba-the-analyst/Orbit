# ORBIT: marketplace, delivery and ride-hailing for Nigeria and Africa

**ENT 312 Venture Creation: working product, in pilot-ready test mode.**

ORBIT is one app for three everyday needs. People **buy from verified local shops**, **book rides, parcels and freight** (bicycle, motorbike, keke, car, van, truck, lorry), and **choose who delivers**: the shop's own rider, an ORBIT rider, or pickup. It works across Nigeria and is configured for Ghana, Kenya and South Africa.

| Folder | What it is |
|---|---|
| `backend/` | The API. NestJS 11, TypeORM, SQLite (default) or PostgreSQL, JWT auth, Socket.IO, Swagger at `/docs`. |
| `mobile/` | The app for every role. Vue 3, Ionic 8, Capacitor 8. Runs in a browser and packages as an Android or iOS app. |
| `docs/` | Architecture, API reference, design brief, deployment guide, assessor checklist. |
| `.github/workflows/` | CI (tests and build), Android APK, iOS TestFlight. |

## Who can do what

- **Customers:** browse shops across the country (by city, distance, category), order with pickup, shop delivery or ORBIT delivery, pay (test mode), track the courier live on a map, confirm with a PIN, rate. Book **rides**, **parcels** and **freight** with a fare quote, surge price lock, promo codes, cash or card, live driver tracking, share-trip link, SOS, tips and receipts.
- **Merchants:** everything a customer can do, plus a catalogue (goods or services, up to 6 pictures, description, size and weight, goods type such as food or perishable), shop profile with logo, cover and map pin, personal riders they invite, and earnings.
- **Drivers and riders:** go online, receive timed offers, navigate with turn-by-turn links, collect with PINs, cash or card, earnings, a garage of vehicles with photos, and document upload. **Heavy-goods owners** (van, truck, lorry, long-haul) form a separate fleet category.
- **Admins:** verification queue with private document and vehicle review, all trips and orders, SOS safety desk, promo codes, KPIs. A **superadmin** creates up to six other admins.
- **Everyone:** animated loading screen and skeletons, in-app notifications, a guided tour per role, dark mode, privacy controls (export or delete your data).

## What is real, and what is deliberately not

- **Payments are a clearly labelled test mode.** No real money moves. A Paystack or Flutterwave adapter is the next step and plugs into the same webhook path.
- **No bank payouts.** Earnings are what ORBIT owes, from the ledger.
- **Maps use free OpenStreetMap services** (tiles, Nominatim search, OSRM routing). They are rate limited and meant for pilots; set `TILE_URL`, `NOMINATIM_URL` and `OSRM_URL` to a paid or self-hosted provider before scale.
- **Demo data is fictional.** Real activity only appears after people use the app.
- **Native builds are produced by CI**, not in the development sandbox. See `docs/DEPLOYMENT.md`.

## Run it locally (five minutes)

You need Node.js 20 or newer (tested on 22). SQLite is the default, so no database is needed.

```bash
# 1. API on http://localhost:4000/api  (docs at /docs)
cd backend && npm install && npm run build && npm run start:prod

# 2. App on http://localhost:5173
cd mobile && npm install && npm run dev
```

On first start with an empty database the API loads fictional demo shops, riders and customers. **All demo accounts use the password `Orbit@2026`.**

| Role | Email |
|---|---|
| Customer | `student@orbit.demo` |
| Merchant | `nkechi@orbit.demo` |
| Rider | `rider1@orbit.demo` |
| Admin | `admin@orbit.demo` |

**Superadmin:** set `SUPERADMIN_EMAIL` and `SUPERADMIN_PASSWORD` in `backend/.env` (git-ignored) before the first start. The account is created once, never by promoting an existing user. Change the password after first sign-in. Never commit it.

Everything in one command with Docker: `docker compose up --build`, then open `http://localhost:8080`.

## Tests

```bash
cd backend && npm test             # 160 tests on SQLite
cd backend && npm run test:pg      # the same suites on PostgreSQL (set DATABASE_URL)
cd mobile  && npm run build        # type-check and production build
cd mobile  && node e2e/smoke.cjs   # every role, every main screen, light and dark (API on :4000, web on :4173)
```

## The money rules

- Whole currency units only (no fractions). Every record carries its currency: ₦ NGN, GH₵ GHS, KSh KES, R ZAR.
- Marketplace commission 8% on the item subtotal. ORBIT delivery fee is a flat amount with a fixed rider payout. A shop's own delivery fee is kept entirely by the shop.
- Trip commission 10% of the fare. Promo discounts come out of ORBIT's commission, never the driver's pay.
- Cash trips: the driver collects the fare and owes ORBIT the commission, tracked in the ledger.

## Put it online and test with real people

Follow `docs/DEPLOYMENT.md`: API and PostgreSQL on Render, web app on Netlify, installable Android APK from GitHub Actions, iOS through TestFlight.

## Where to read next

- `docs/DEPLOYMENT.md`: hosting, environment variables, APK and TestFlight.
- `docs/ARCHITECTURE.md`: how it is built, including section 13 on mobility and multi-country.
- `docs/API.md`: endpoints.
- `docs/DESIGN.md`: design decisions.
- `docs/ASSESSOR-CHECKLIST.md`: proposal requirements mapped to where they live.
