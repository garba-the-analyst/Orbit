# ORBIT API reference

Base URL (development): `http://localhost:4000/api`
Interactive docs with "Try it out": `http://localhost:4000/docs` (generated from the code, so it is always current).

This file is the human-readable summary. All bodies are JSON. Money is **whole naira as integers** (`2800` means ₦2,800).

## Conventions

**Authentication.** Sign in to get a token, then send `Authorization: Bearer <token>` on every request except the ones marked *public*.

**Roles.** `CUSTOMER`, `MERCHANT`, `RIDER`, `ADMIN`. A route not meant for your role returns 403.

**Validation.** Unknown fields in a request body are rejected with 400, not ignored. Error bodies look like:

```json
{ "statusCode": 400, "message": ["Enter a valid Nigerian phone number, like 08031234567."], "error": "Bad Request" }
```

| Status | Meaning |
|---|---|
| 400 | Invalid input (wrong field, wrong PIN, amount mismatch) |
| 401 | Missing, invalid or expired token; wrong sign-in details; bad webhook signature; suspended account |
| 403 | Your role cannot use this route |
| 404 | Not found, **or not yours** (orders you are not a party to look like they do not exist) |
| 409 | Conflict: the order already moved on, the shop is closed, not enough stock, someone else claimed the job |
| 423 | Order is locked after too many wrong PINs |
| 429 | Rate limit, or account temporarily locked after failed sign-ins |

**Rate limits** (per client, per minute, configurable): 240 overall; 10 on register and login.

---

## Public

| Method and path | Purpose |
|---|---|
| `GET /health` | Liveness and database check: `{ status, db, uptimeSeconds, env }` |
| `GET /config` | Settings the app needs before sign-in: `currency`, `pilotZone`, `commissionPct`, `orbitDeliveryFee`, `paymentProvider`, `pendingPaymentTtlMin`, and (development only) one-tap `demo` accounts |
| `POST /auth/register` | Create an account (below) |
| `POST /auth/login` | Sign in (below) |
| `POST /payments/webhook` | Payment gateway callback (signed, below) |

### `POST /auth/register`

```json
{
  "name": "Amina Yusuf",
  "email": "amina@example.com",
  "phone": "08031234567",
  "password": "Orbit@2026",
  "role": "CUSTOMER"
}
```

- `role` is `CUSTOMER`, `MERCHANT` or `RIDER`. Admin accounts cannot be self-registered.
- Password: 8 to 72 characters with at least one letter and one number.
- Phone: Nigerian mobile format (`0803…` or `+234803…`).
- **Merchants** also send `shopName`, `shopCategory` (`Food`, `Groceries`, `Stationery`, `Gadgets`), `shopAddress`.
- **Riders** also send `vehicle` (`BICYCLE`, `MOTORCYCLE`, `KEKE`).
- Merchants and riders are created as `PENDING_VERIFICATION` and cannot work until an admin approves them.
- Returns `{ token, user }`.

### `POST /auth/login`

`{ "email": "...", "password": "..." }` returns `{ token, user }`. Wrong password and unknown email give the same error. Five failures lock the account for 15 minutes.

---

## Any signed-in user

| Method and path | Purpose |
|---|---|
| `GET /me` | The current user, including `status` (so the app can show the "in the queue" screen) |
| `PATCH /me` | Update `name` and/or `phone` |
| `GET /shops?q=&category=` | Approved shops. `q` matches shop name, category **and product names**. `category` filters. |
| `GET /shops/:id` | One shop with its available products |
| `GET /orders/:id` | One order, **shaped for who is asking** (see "The order view") |

---

## Customer (`CUSTOMER`)

| Method and path | Purpose |
|---|---|
| `POST /orders` | Place an order. Returns `{ order, payment }`, where `payment` is `{ reference, amount, provider }` |
| `GET /orders` | Your orders, newest first |
| `POST /orders/:id/pay` | Start a new payment attempt for an unpaid order (after a failure). Returns a payment intent. |
| `POST /orders/:id/cancel` | Cancel before the shop confirms. Body: optional `{ "reason" }`. Refunds if paid. |
| `POST /orders/:id/rate` | After delivery: `{ "rating": 1-5, "comment"?: "..." }`. One rating per order. |
| `POST /payments/:reference/simulate` | **Test mode only.** `{ "outcome": "success" \| "failed" }` |

### `POST /orders`

```json
{
  "shopId": "<uuid>",
  "items": [ { "productId": "<uuid>", "qty": 2 }, { "productId": "<uuid>", "qty": 1 } ],
  "fulfilment": "ORBIT_COURIER",
  "deliveryAddress": "Hostel A, Room 12",
  "deliveryNote": "Call when you reach the gate",
  "contactPhone": "08031230100"
}
```

- `fulfilment`: `PICKUP`, `MERCHANT_DELIVERY` or `ORBIT_COURIER`.
- `deliveryAddress` is required (5 to 240 characters) unless `PICKUP`.
- `qty` is 1 to 20 per line; up to 30 lines.
- **There is no price in the request.** Prices and every charge are computed on the server. Sending a price field is rejected.
- `contactPhone` defaults to the account phone.
- The order starts as `PENDING_PAYMENT` and stock is reserved immediately. It expires after 15 minutes if unpaid.

---

## Shop owner (`MERCHANT`, approved)

| Method and path | Purpose |
|---|---|
| `GET /merchant/shop` | Your shop |
| `PATCH /merchant/shop` | Any of: `name`, `description`, `address`, `isOpen`, `prepMinutes` (1 to 180), `offersDelivery`, `deliveryFee` (0 to 10,000) |
| `GET /merchant/products` | Your catalogue |
| `POST /merchant/products` | `{ name, description?, price, stock, available? }` (price 1 to 5,000,000; stock 0 to 100,000). Screened against the prohibited-goods list. |
| `PATCH /merchant/products/:id` | Change any of those fields |
| `DELETE /merchant/products/:id` | Remove a product |
| `GET /merchant/orders` | Your shop's **paid** orders, newest first |
| `POST /merchant/orders/:id/accept` | `{ "prepMinutes"? }` (1 to 180; defaults to the shop's prep time). `PLACED` to `CONFIRMED`. |
| `POST /merchant/orders/:id/cancel` | Decline a new order, or cancel a confirmed one you cannot fulfil. Customer is refunded and stock returns. |
| `POST /merchant/orders/:id/ready` | `CONFIRMED` to `READY`; wakes the rider or tells the customer to collect |
| `POST /merchant/orders/:id/dispatch` | Shop-delivery orders: shop sets the order on its way |
| `POST /merchant/orders/:id/complete` | `{ "pin": "4821" }` for **pickup** and **shop-delivery** orders: the shop confirms handover with the customer's PIN |
| `GET /merchant/earnings` | Totals and recent ledger lines (see below) |

You can only touch your own shop, products and orders; anything else is 404.

---

## Rider (`RIDER`, approved)

| Method and path | Purpose |
|---|---|
| `PUT /rider/availability` | `{ "online": true }`. Offline riders cannot claim jobs. |
| `GET /rider/jobs` | Open ORBIT-courier jobs, **personal details withheld** |
| `POST /rider/jobs/:id/claim` | Take a job. Exactly one rider wins if several try at once; the rest get 409. Reveals the delivery details. |
| `POST /rider/jobs/:id/release` | Give a claimed job back (before collection) |
| `GET /rider/active` | Your claimed jobs, with details |
| `POST /rider/jobs/:id/pickup` | "I have collected the order": `READY` to `ON_THE_WAY` |
| `POST /rider/jobs/:id/deliver` | `{ "pin": "4821" }`: completes the delivery. Wrong PIN: 400 with tries left; the 5th wrong PIN: 423 (locked). |
| `GET /rider/history` | Your completed deliveries |
| `GET /rider/earnings` | Totals and recent ledger lines |

---

## Admin (`ADMIN`)

| Method and path | Purpose |
|---|---|
| `GET /admin/queue` | `{ merchants: [...], riders: [...] }` waiting for verification |
| `POST /admin/users/:id/approve` | Approve a merchant (and their shop) or rider |
| `POST /admin/users/:id/suspend` | Suspend an account; takes effect on that user's next request |
| `GET /admin/orders` | The latest 50 orders across ORBIT (never includes PINs) |
| `POST /admin/orders/:id/unlock-pin` | Reset a PIN lockout after confirming the customer |
| `GET /admin/kpis` | The proposal section 12 snapshot (below) |

### `GET /admin/kpis`

```
marketplace: activeMerchants, listedProducts, completedOrders, gmv, averageBasket,
             repeatPurchaseRatePct, refundRatePct, openOrders
logistics:   courierDeliveries, averageDeliveryMinutes, orderCompletionRatePct,
             activeRiders, onlineRiders
financial:   platformRevenue, commission, deliveryContribution, contributionPerOrder,
             owedToMerchants, owedToRiders
verificationQueue: pendingMerchants, pendingRiders
```

- `gmv` is the total of item subtotals of **delivered** orders (delivery fees are not sales).
- `platformRevenue` = commission + delivery contribution, read from the ledger.
- Averages and percentages (`averageBasket`, `repeatPurchaseRatePct`, `refundRatePct`, `averageDeliveryMinutes`, `orderCompletionRatePct`, `contributionPerOrder`) are `null` until there is data to compute them from, rather than a made-up number.

---

## The order view

`GET /orders/:id` and every order action return the same shape, redacted for the viewer.

```
id, waybillNo, status, fulfilment,
shop { id, name, color, address, category },
items [ { productId, name, unitPrice, qty } ], itemCount,
subtotal, deliveryFee, total,
money           // role-specific: shop sees itemSales/commission/yourEarnings; rider sees payout
deliveryAddress, deliveryNote, customer { name, phone }, courier { name, phone, vehicle },
pin             // customer only, only while the order is in progress
pinLocked, prepMinutes, estimatedReadyAt,
cancelledBy, cancelReason, rating, reviewText,
redacted        // true on the rider job board
timeline { createdAt, paidAt, confirmedAt, readyAt, pickedUpAt, deliveredAt, cancelledAt }
```

Who sees what is set out in `ARCHITECTURE.md`, section 7.

Statuses: `PENDING_PAYMENT`, `PLACED`, `CONFIRMED`, `READY`, `ON_THE_WAY`, `DELIVERED`, `CANCELLED`.

---

## Earnings (`/merchant/earnings`, `/rider/earnings`)

Read from the settlement ledger. Shows `total`, `today`, `ordersSettled`, `last7Days` (daily amounts for the chart) and `recent` lines `{ orderId, waybillNo, kind, amount, at }`. Line kinds: `SALE_NET` (sale after commission), `MERCHANT_DELIVERY_FEE`, `DELIVERY_PAYOUT`.

---

## Payment webhook

`POST /payments/webhook` is what a real gateway calls.

- Header `x-orbit-signature`: hex **HMAC-SHA256** of the **raw request body** using `WEBHOOK_SECRET`.
- Body: `{ "event": "charge.success" | "charge.failed", "data": { "reference": "...", "amount": 7100 } }`.
- Missing or wrong signature: 401. `charge.success` with an `amount` different from the order total: 400, and the order stays unpaid.
- **Idempotent:** the same event delivered twice changes nothing the second time (gateways retry).
- A success arriving after the order's payment window expired is **refunded**, not applied.

Example (the same calculation the tests use):

```bash
BODY='{"event":"charge.success","data":{"reference":"<reference>","amount":7100}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -X POST http://localhost:4000/api/payments/webhook \
  -H 'Content-Type: application/json' -H "x-orbit-signature: $SIG" -d "$BODY"
```

To run this by hand, set `WEBHOOK_SECRET` (any string of 32 or more characters) in `backend/.env` and restart the API. If you do not set it, development mode uses a random secret that changes on every start, so no outside caller could sign a valid request.

---

## Realtime (Socket.IO)

Connect to the API origin **without** the `/api` prefix, passing the same JWT:

```js
import { io } from 'socket.io-client';
const socket = io('http://localhost:4000', { auth: { token } });
socket.on('order.updated', ({ orderId, status }) => { /* re-fetch GET /orders/:id */ });
```

A missing or invalid token is rejected at connect. Events carry **no personal or financial data**, only a signal to re-fetch:

| Event | Sent to | Meaning |
|---|---|---|
| `order.updated` `{ orderId, status }` | The customer, the shop owner, and the assigned rider of that order | The order changed |
| `jobs.changed` | Approved riders | The job board changed (a job appeared or was taken) |
| `admin.changed` | Admins | The verification queue or KPIs may have changed |
| `account.updated` | One user | Their approval status changed |
