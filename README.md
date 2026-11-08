# ORBIT: campus marketplace, delivery and (later) mobility

**ENT 312 Venture Creation: working MVP**

ORBIT lets students buy from verified local shops and choose how the goods reach them: **pick up**, **the shop delivers**, or an **ORBIT rider** brings it, with live tracking and a PIN so the right person receives it. This repository is the working MVP of the business proposal (v1.0.0, 30 Oct 2026).

| Folder | What it is |
|---|---|
| `backend/` | The API. NestJS 11, TypeORM, SQLite (default) or PostgreSQL, JWT auth, Socket.IO, Swagger docs. |
| `mobile/` | The app for all four roles (customer, shop owner, rider, admin). Vue 3, Ionic 8, Capacitor 8. Runs in a browser and packages as an Android/iOS app. |
| `docs/` | Architecture, API reference, design brief, and the assessor checklist. |

---

## What is real, and what is deliberately not

Read this first, so nobody is surprised during assessment.

**Working end to end (tested):**
- Four roles with sign-in, and admin verification of shops and riders before they go live.
- Shop catalogue with stock; atomic stock reservation at checkout, released on cancel or non-payment.
- Checkout with the three delivery choices, with the exact charges shown before paying.
- Order lifecycle: payment, shop accepts and packs, rider claims and collects, delivery, rating.
- **Delivery PIN**: the customer sees a 4-digit PIN; the rider (or the shop, for pickup) must enter it. Five wrong tries lock the order and an admin must unlock it.
- Real-time tracking: every screen updates live when another person acts.
- Settlement ledger and earnings screens for shops and riders; admin KPIs from proposal section 12.
- Prohibited-goods screening on product listings (proposal section 4.2).

**Deliberately simulated or left out:**
- **Payments are a test-mode mock.** No real money moves. The "Pay" and "Simulate a failed payment" buttons stand in for a gateway such as Paystack or Flutterwave, and they go through the same code path as the signed webhook the real gateway would call. The app says "Test mode" on screen.
- **No bank payouts.** Earnings are shown as what ORBIT owes, from the ledger.
- **Ride-hailing is not built.** The proposal puts it in Phase 5 behind legal clearance, so it is excluded on purpose.
- **No traction is claimed.** The demo shops, people and phone numbers are fictional sample data, and the database starts with no past orders. Every number you see in the admin KPIs comes from orders actually placed in the demo.
- The Android app has **not been built in the development environment** (no Android SDK there). The web build is verified in a phone-sized browser; see "Build the Android app" below for the exact steps.
- The **Docker images have not been built in the development environment** (no Docker daemon there). The build steps and the exact runtime configuration were reproduced and verified step by step, but if `docker compose up --build` fails on your machine, the error will point to the cause, and the non-Docker route below always works.

---

## Run it (about five minutes)

You need **Node.js 20 or newer** (tested on Node 22). No database to install: SQLite is the default.

### 1. Start the API

```bash
cd backend
npm install
npm run build
npm run start:prod        # API on http://localhost:4000/api
```

On the first start with an empty database it loads the fictional demo data. Check it is up:
`http://localhost:4000/api/health` should return `{"status":"ok", ...}`.
Interactive API docs: `http://localhost:4000/docs`.

### 2. Start the app

In a second terminal:

```bash
cd mobile
npm install
npm run dev               # http://localhost:5173
```

Open it in a desktop browser (it shows as a phone-width column) or, better, in the browser's phone view (Chrome: F12, then the device toolbar). To try the production build instead, run `npm run build && npm run preview` and open `http://localhost:4173`.

To use it **on your phone**, join the same Wi-Fi, run `npm run dev`, and open `http://<your-computer's-IP>:5173` on the phone. The app finds the API at the same address on port 4000 automatically.

### 3. Sign in

On the sign-in screen, under "Demo accounts", one tap signs you in as each role. All demo accounts use the password **`Orbit@2026`**.

| Role | Email | Notes |
|---|---|---|
| Customer | `student@orbit.demo` | Zainab Musa. Also `student2@orbit.demo`. |
| Shop owner | `nkechi@orbit.demo` | Mama Nkechi's Kitchen. Other shops: `suleiman@`, `ibrahim@`, `olayinka@`, `hauwa@`, `chinedu@` `orbit.demo`. |
| Rider (online) | `rider1@orbit.demo` | Also `rider2@orbit.demo`. |
| Admin | `admin@orbit.demo` | Verification queue, KPIs, all orders. |
| Waiting for approval | `maryam@orbit.demo` (shop), `rider3@orbit.demo` (rider) | They see the "you are in the queue" screen until the admin approves them. |

### Or run everything with Docker

If you have Docker installed, one command starts PostgreSQL, the API and the web app:

```bash
docker compose up --build
```

Open `http://localhost:8080` for the app and `http://localhost:4000/docs` for the API docs. This runs in **demo mode** (fictional demo data, test-mode payments, fixed demo-only secrets so a restart does not sign anyone out). Stop it with `Ctrl+C`; `docker compose down -v` also wipes the database.

---

## Demo script (8 minutes, four browser windows)

The best demonstration shows one order crossing four people. Open four windows (or one window plus three private windows), one per role.

1. **Customer.** Search "jollof" (it finds the shop by product). Open Mama Nkechi's Kitchen, add 2 jollof rice and 1 moi moi. Open the basket and choose **ORBIT rider**. Enter an address. The total is **₦7,100**: ₦6,400 of food plus the ₦700 ORBIT delivery fee.
2. **Customer.** Tap Pay. Tap **Simulate a failed payment** to show the failure handling, then Pay again. Note the 4-digit **PIN** on the order screen.
3. **Shop owner.** The new order appears instantly. It shows **You earn ₦5,888** (sales ₦6,400 less the 8% commission of ₦512). Choose a prep time and Accept.
4. **Customer.** The tracker moves to "Shop is preparing" with no refresh.
5. **Rider.** The job board shows the pickup shop and the earning (**₦400**) but **not** the customer's address. Accept the job: the address is revealed now. This is the privacy rule.
6. **Shop owner.** Mark ready. **Rider.** "I have collected the order".
7. **Rider.** Complete delivery. Type a wrong PIN first to show it is refused ("4 tries left"), then the right PIN.
8. **Customer.** The order shows Delivered; rate the shop.
9. **Rider and shop.** Earnings now show the delivery (**₦400**) and sale (**₦5,888**).
10. **Admin.** KPIs show **₦812** ORBIT revenue from that one order (₦512 commission + ₦300 delivery contribution). Verification queue: approve the waiting rider or shop.

Everything in steps 3 to 10 happens live across the windows. That is the Socket.IO layer from proposal section 9.

---

## The money rules

All amounts are whole naira (no decimals, so no rounding drift). Configured in `backend/.env.example`.

| Rule | Value | Source |
|---|---|---|
| Marketplace commission | 8% of the **item subtotal only** (never on delivery fees) | Proposal sections 6 and 11 |
| ORBIT rider delivery, customer pays | ₦700 | Proposal |
| ORBIT rider delivery, rider earns | ₦400 | Proposal |
| ORBIT keeps from delivery | ₦300 | ₦700 less ₦400 |
| Shop's own delivery | The shop sets the fee and keeps all of it | Proposal |
| Unpaid orders | Cancelled and stock released after 15 minutes | Design decision |

A test proves that for every delivered order, **merchant + rider + ORBIT ledger lines add up exactly to what the customer paid.**

---

## Tests

```bash
cd backend && npm test          # 38 tests: 12 rule tests + 26 end-to-end API tests (on SQLite)
cd backend && npm run test:pg   # the same 26 end-to-end tests on a real PostgreSQL (setup below)
cd mobile  && npm test          # 12 unit tests (money formatting and form validation)
cd mobile  && npm run build     # type-checks and builds the app
```

To run the PostgreSQL suite you need an **empty** database (the tests create the tables and demo data). With Docker:

```bash
docker run -d --name orbit-pg -e POSTGRES_USER=orbit -e POSTGRES_PASSWORD=orbit -e POSTGRES_DB=orbit_test -p 5432:5432 postgres:16-alpine
cd backend && npm run test:pg          # uses postgres://orbit:orbit@localhost:5432/orbit_test
# to run it again, recreate the database first:
docker exec orbit-pg dropdb -U orbit orbit_test && docker exec orbit-pg createdb -U orbit orbit_test
```

Any other PostgreSQL works too: set `TEST_DATABASE_URL` to an empty database. This suite includes the concurrency tests (no overselling; exactly one rider wins a job), so it shows those guarantees hold on the production database and not only on SQLite.

There is also a **full cross-role UI test** that drives the real app in a phone-sized browser through the whole demo above (17 steps). It needs the API running with fresh demo data and the app served on port 4173, and uses Playwright installed on the machine:

```bash
cd backend && rm -rf data && npm run start:prod &      # fresh demo data
cd mobile  && npm run build && npm run preview &       # app on :4173
cd mobile  && node e2e/ui-flow.cjs                     # SHOTS=./shots saves screenshots
```

What the 38 backend tests cover includes: the charge calculation, the order state machine, double-submit and race safety, stock never going negative, payment webhook signature and amount checks, a payment arriving late being refunded, the PIN lockout, role and privacy boundaries (a rider cannot see an address before claiming, a customer cannot see another customer's order), suspended users being locked out immediately, and the settlement invariant above.

---

## Build the Android app

The app is a standard Capacitor project (`appId: ng.orbit.app`). You need **Android Studio** (it includes the Android SDK) and Java 17 or newer.

```bash
cd mobile
# Tell the app where the API is. "localhost" on a phone means the phone itself,
# so use your computer's address (phone and computer on the same Wi-Fi), or your hosted API.
echo "VITE_API_URL=http://192.168.1.20:4000/api" > .env.production

npm install
npm install @capacitor/android          # first time only
npx cap add android                     # first time only
npm run cap:android                     # builds the web app, syncs it, opens Android Studio
```

In Android Studio press **Run** to install on a connected phone or emulator, or choose **Build, then Build Bundle(s) / APK(s), then Build APK(s)** to produce `app-debug.apk` you can send to a phone.

Notes:
- `capacitor.config.ts` allows plain `http` so the app can reach a development API. **Remove `cleartext: true` and serve the API over HTTPS before any real release.**
- iOS works the same way with `@capacitor/ios` and `npx cap add ios` on a Mac.
- The API must be reachable from the phone. For the course demonstration, running the API on your laptop and the phone on the same Wi-Fi is enough.

---

## Configuration

Copy `backend/.env.example` to `backend/.env` to change anything. Every value has a safe development default.

- **PostgreSQL instead of SQLite:** set `DB_TYPE=postgres` and `DATABASE_URL=postgres://user:pass@host:5432/db`.
- **Production safety:** with `NODE_ENV=production` the API **refuses to start** unless `JWT_SECRET`, `PIN_SECRET` and `WEBHOOK_SECRET` are set to strong values (32 or more characters), and it refuses mock payments unless you explicitly set `ALLOW_MOCK_PAYMENTS=true`. Demo data never loads in production.
- **Secrets in development:** if `JWT_SECRET`, `PIN_SECRET` and `WEBHOOK_SECRET` are not set, the API generates random ones each time it starts. That is safe, but it means **restarting the API signs everyone out and changes every delivery PIN**. If you restart during a rehearsal, set fixed values (any 32+ character strings) in `backend/.env` first.
- **Reset the demo:** stop the API, delete `backend/data/`, start it again.

---

## Where to read next

- `docs/ASSESSOR-CHECKLIST.md`: every proposal feature mapped to where it lives and how to see it work.
- `docs/ARCHITECTURE.md`: how it is built and why, including the security design and what changes for production.
- `docs/API.md`: the REST and realtime reference.
- `docs/DESIGN.md`: the design brief behind the interface.
