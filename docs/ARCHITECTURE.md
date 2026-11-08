# ORBIT architecture

This document explains how the MVP is built, why, and what must change before real customers use it. It is written for an assessor or a developer joining the project.

## 1. Shape of the system

```
 ┌────────────────────────────┐         REST (JSON, JWT)          ┌──────────────────────────────────┐
 │  Mobile app (mobile/)      │ ────────────────────────────────▶ │  API (backend/), one deployable  │
 │  Vue 3 + Ionic + Capacitor │ ◀──────────────────────────────── │  NestJS modular monolith         │
 │  one app, four role UIs    │      Socket.IO "something         │                                  │
 └────────────────────────────┘      changed" signals only        │  auth · users · shops · products │
                                                                   │  orders · payments · dispatch    │
                                                                   │  earnings · admin · realtime     │
                                                                   └───────────────┬──────────────────┘
                                                                                   │ TypeORM
                                                                      SQLite (default) / PostgreSQL
```

**A modular monolith, on purpose.** Proposal section 9 calls for one deployable with strict module boundaries. For a student pilot that is the right call: one process to run, one database, transactions that span orders, stock and the ledger, and no network calls between services to fail. The modules are separated cleanly enough to be split later if scale demands it.

**One app, four roles.** The mobile app is a single codebase. After sign-in the router sends each person to their own area (`/c` customer, `/m` shop owner, `/r` rider, `/a` admin) and guards each prefix by role. Merchants and riders who are not yet approved are sent to a "you are in the queue" screen.

## 2. Backend modules

| Module | Responsibility |
|---|---|
| `auth` | Register, login, lockout, JWT. Merchants and riders start as pending. |
| `users` | The current user's profile; rider online/offline. |
| `shops`, `products` | Public shop and product search; the merchant's own shop and catalogue; prohibited-goods screening. |
| `orders` | Order creation, the state machine, PIN verification, cancellation, ratings, the payment-expiry sweeper, and the per-role views of an order. |
| `payments` | The payment record, the signed webhook, and the test-mode simulator. |
| `dispatch` | The rider job board: list, claim, release, pick up, deliver. |
| `earnings` | The settlement ledger and the shop and rider earnings summaries. |
| `admin` | Verification queue, approve/suspend, all orders, PIN unlock, KPIs. |
| `realtime` | The Socket.IO gateway and the signals it emits. |
| `common`, `config`, `database` | Money rules, PIN derivation, policy, guards, typed configuration. |

Request pipeline order: **rate limit, then authenticate, then authorise by role** (`app.module.ts`). Input is validated with a whitelist, so unknown fields are rejected (HTTP 400) rather than silently ignored.

## 3. Money and settlement

All money is whole naira stored as integers, so there is no floating-point error. The charge calculation is one pure function, `computeCharges()` in `common/money.ts`, with its own unit tests.

| Delivery choice | Customer pays | Shop gets | Rider gets | ORBIT gets |
|---|---|---|---|---|
| Pick up | items | items less 8% | none | 8% of items |
| Shop delivers | items + shop's fee | items less 8%, plus the whole delivery fee | none | 8% of items |
| ORBIT rider | items + ₦700 | items less 8% | ₦400 | 8% of items + ₦300 |

Commission applies to **item subtotal only**, never to delivery fees.

**Ledger.** When an order is delivered, the system writes one ledger line per party (merchant, courier, platform) inside the same database transaction that marks the order delivered. The invariant, tested for every flow, is:

> merchant lines + courier lines + platform lines = the amount the customer paid

Earnings screens and the admin KPIs read from the ledger, so what a shop sees and what ORBIT reports cannot drift apart. The ledger is append-only **in the code**: the only write is the single insert made inside the delivery transaction, and nothing updates or deletes ledger rows. (For production, also enforce this in the database, for example by giving the application's database user insert and select rights only on that table.)

**The customer never sets a price.** The client sends product ids and quantities; the server looks up prices and computes every charge. A test confirms client-supplied prices are ignored.

## 4. The order state machine

```
 PENDING_PAYMENT ─▶ PLACED ─▶ CONFIRMED ─▶ READY ─▶ ON_THE_WAY ─▶ DELIVERED
        │              │          │                                   (pickup skips ON_THE_WAY:
        ▼              ▼          ▼                                    the shop checks the PIN at READY)
                       CANCELLED (see the table below)
```

| Who | Can cancel from | Why |
|---|---|---|
| Customer | `PENDING_PAYMENT`, `PLACED` | Until the shop has confirmed. After that the food is being prepared. |
| Shop | `PLACED`, `CONFIRMED` | Decline a new order, or cancel one it cannot fulfil (for example, sold out). The customer is refunded. |
| System | `PENDING_PAYMENT` | Payment not completed within 15 minutes. |

Every cancellation runs in one transaction: status change, stock returned, payment marked refunded (or failed, if it was never paid).

- Every transition is a conditional update, `UPDATE … WHERE id = ? AND status IN (…)`. If two requests race, exactly one changes a row and the other gets a clear conflict. This is what makes "two riders accept the same job" and "double-tap Pay" safe, without locks.
- **Stock** is reserved with `UPDATE … SET stock = stock - qty WHERE stock >= qty`, atomically at order creation. Two simultaneous orders for the last unit: exactly one succeeds. Stock is released when an order is cancelled or its payment window (15 minutes) expires. A background sweeper handles expiry.

## 5. Payments

The MVP uses a **mock gateway**, built so the swap to a real one is small:

- `POST /payments/webhook` is the real entry point. It requires an **HMAC-SHA256 signature** (`WEBHOOK_SECRET`), checks that the **amount matches the order total**, and is **idempotent**.
- `POST /payments/:reference/simulate` (test mode only) feeds the same internal `handleEvent` function, so the demo exercises the real logic and not a shortcut.
- A late success for an order that already expired is **refunded**, not applied. A failed payment can be retried.
- Production refuses to start with mock payments unless `ALLOW_MOCK_PAYMENTS=true`.

**To go live with a real gateway:** implement a provider that creates a checkout session for `POST /orders/:id/pay` and translates the gateway's webhook into the same internal event. Nothing else in the order or ledger code changes.

## 6. The delivery PIN

Proposal section 4.2: confirm receipt with a delivery PIN.

- The PIN is **derived, not stored**: `HMAC-SHA256(PIN_SECRET, orderId)`, reduced to 4 digits. There is no PIN column to leak from a database dump, and it is stable so the customer can reopen the order and see the same PIN.
- It is shown **only to the customer** who owns the order. Riders, shops and admins never receive it from the API.
- Comparison is constant-time. **Five wrong tries lock the order** (HTTP 423); only an admin can unlock it, after confirming the customer.
- 4 digits is a usability choice for a pilot. The lockout is what makes it safe: an attacker gets 5 guesses out of 10,000.

## 7. Privacy by role

The same order looks different to each person (`orders/order.view.ts`):

| Viewer | Sees |
|---|---|
| Customer | Everything about their own order. The PIN is shown only while the order is in progress (paid, and not yet delivered or cancelled). |
| Shop owner | Items and the customer's **first name**. The customer's phone only when the shop hands the goods over itself (pickup or shop delivery). The delivery address only when the shop delivers. For an ORBIT rider delivery the shop sees neither. |
| Rider (job board) | Pickup shop, earning, item count. **No customer name, address or phone** until they claim the job. |
| Rider (after claiming) | The customer's first name, phone and delivery address, for that job only. |
| Admin | Everything operational, but never the PIN. |

Anyone who is not a party to an order gets **404 (not 403)**, so ids cannot be probed for existence.

## 8. Authentication and abuse protection

- Passwords hashed with **bcrypt**; at least 8 characters with a letter and a number.
- One generic error for "wrong password" and "no such email", and a password check against a dummy hash when the email is unknown, so response time does not reveal which emails exist. (A locked account does report that it is locked, which is a deliberate usability trade-off.)
- **Five failed logins lock the account for 15 minutes.**
- Rate limits: 240 requests per minute per client overall, and 10 per minute on register and login (configurable).
- JWT bearer tokens. The guard **loads the user from the database on every request**, so suspending an account takes effect on its very next request rather than when the token expires.
- `helmet` headers; CORS restricted to `CORS_ORIGINS` in production; request bodies validated with a whitelist.
- Production refuses to boot with weak or missing secrets.

## 9. Realtime

Socket.IO carries **signals, not data**: `order.updated`, `jobs.changed`, `admin.changed`, `account.updated`. A signal says "something changed" and the app re-fetches the current state through the normal REST endpoints, which apply all the permission and privacy rules.

This design means a bug in the realtime layer can never leak private data, because it never carries any. The socket handshake requires a valid token; a bad token is rejected (tested). Each user is placed in their own room, riders in a shared job room, admins in an admin room.

## 10. The mobile app

- **Stack:** Vue 3 (Composition API), Ionic Vue for native-feeling navigation and gestures, Pinia for state, Capacitor to package as Android/iOS.
- **Layers:** `api/` (typed REST client, endpoints, socket) → `stores/` (auth, basket, config, badges) → `components/` and `pages/`. Pages never call `fetch` directly.
- **Honest states everywhere:** loading skeletons shaped like the content, specific empty states, and an error with a "Try again" button on every list; nothing fails silently.
- **Design:** see `DESIGN.md`. The one bold element is the orbit-ring order tracker; the rest is deliberately quiet.

## 11. Testing strategy

| Layer | What | How |
|---|---|---|
| Rules | Charge maths, PIN derivation, webhook signature, prohibited-goods screen | 12 fast unit tests |
| API | Auth, roles, catalogue, all three order flows, concurrency, cancellations, expiry, webhook security, KPIs, realtime | 26 end-to-end tests, run against in-memory SQLite (`npm test`) **and** a real PostgreSQL 16 (`npm run test:pg`) |
| App logic | Money formatting, form validation | 12 unit tests |
| Whole system | Four people, one order, through the real UI | 17-step Playwright flow with screenshots |

The end-to-end tests are written around **failure and abuse** (races, tampering, wrong roles), because those are the places a marketplace loses money or trust.

## 12. Known limits and the path to production

These are real, and stating them is part of the design.

| Area | MVP | Before real customers |
|---|---|---|
| Payments | Mock gateway | Integrate a gateway (section 5 above); add reconciliation reports. |
| Payouts | Ledger only | Bank transfer payouts to merchants and riders; payout records. |
| Schema changes | TypeORM `synchronize` creates tables | **Switch to migrations** (`DB_SYNC=false`) so a deploy can never alter live data unexpectedly. |
| Database | SQLite file | PostgreSQL. Already supported and tested (`DB_TYPE=postgres`, `npm run test:pg`); the compose file uses it. |
| Transport | `http` allowed for dev | HTTPS only; remove `cleartext` in `capacitor.config.ts`. |
| Containers | `Dockerfile`s and `docker-compose.yml` for demo mode; images not built in the development environment | Build and test the images in CI; run as production (`NODE_ENV=production`) with real secrets, HTTPS and backups. |
| Realtime scale | One process | Redis adapter for Socket.IO if more than one API instance runs. |
| Rider matching | Open job board, first to claim wins | Proximity matching (PostGIS or similar) and live rider location. |
| Notifications | In-app live updates only | Push notifications and SMS for order events. |
| Verification | Admin reviews submitted details | Document upload and ID checks. |
| Prohibited goods | Keyword screen plus admin review | Image review and a reporting flow. |
| Audit | Ledger is append-only in code | Database-level enforcement, plus a general audit log of admin actions (proposal section 13). |
| Ride-hailing | **Not built** | Phase 5 in the proposal, after legal and licensing clearance. |
