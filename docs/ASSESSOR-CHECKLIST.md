# Assessor checklist: the proposal against the MVP

Every requirement below is quoted or paraphrased from **ORBIT Business Proposal v1.0.0** (30 Oct 2026), with an honest status:

- **Done**: built and covered by a test or the end-to-end UI run.
- **Partial**: built in a reduced form; the gap is stated.
- **Not built**: out of the MVP, with the reason.

The proposal asks that technical progress "be independently demonstrated to course assessors" (section 10). The last section lists the commands that do that.

**Summary:** the core of the proposal (section 4.1 marketplace, the section 4.4 differentiator, the section 8 order workflow, the section 6 money rules, the delivery PIN, and the section 12 marketplace and logistics KPIs) is built and tested. Ride-hailing, real payments and payouts, support and dispute tooling, and several production-readiness items (MFA, audit log, monitoring) are not.

---

## Section 4.1: Local e-commerce marketplace

| Requirement | Status | Where to see it |
|---|---|---|
| Merchant and product discovery | Done | Customer, "Shops" (nationwide, filter by city or distance) |
| Search and filter | Done | Search box finds shops **and products** ("jollof"); category tabs |
| Product pages | Partial | Each shop page lists its products with prices and stock. There is no separate page per product. |
| Cart | Done | "View basket" bar, quantity steppers |
| Checkout | Done | Basket screen: delivery choice, address, exact total before paying |
| Order status | Done | Order screen: live orbit tracker |
| Reviews | Done | 1 to 5 star rating after delivery; shop average shown in the list |
| Support | **Not built** | No in-app support or chat. Admin can view all orders and unlock a locked PIN. |
| Merchant registration | Done | "Create account", choose "Shop owner" |
| Merchant verification | Done | Admin, "Verification" tab. Approval is by admin review; there is no document upload. |
| Storefront | Done | Shop owner, "My shop": name, address, open or closed, prep time |
| Catalogue and inventory | Done | "Products": add, edit, hide; stock falls as orders come in and returns on cancel |
| Order acceptance | Done | Shop owner accepts with a preparation time or declines |
| Fulfilment selection | Done | Shop chooses whether to offer its own delivery and sets the fee; the customer chooses at checkout |
| Settlement reporting | Done | Shop owner, "Earnings" (from the ledger) |
| Promotions | **Not built** | Listed in the proposal; not needed for the pilot |
| Local gateway checkout | **Not built** | **Mock gateway in test mode.** The signed webhook a real gateway would call is built and tested. |
| Reconciliation | Partial | Every payment and every ledger line is recorded and consistent; there is no reconciliation report screen. |
| Refund handling | Done | Automatic on cancellation and on late payment after expiry |
| Transparent platform charges | Done | The shop sees commission per order; the customer sees the delivery fee before paying |
| Pickup, merchant delivery, platform courier | Done | The three options in the basket |

## Section 4.2: Logistics and parcel services

| Requirement | Status | Where to see it |
|---|---|---|
| Pickup and delivery requests | Done | Part of every order |
| Digital waybill | Partial | Every order has a waybill number (like `ORB-261107-T7S2`) shown to all parties and on the rider's job. There is no printable waybill document. |
| Track order milestones | Done | Timestamps for paid, confirmed, ready, collected, delivered; live tracker |
| Confirm receipt with a delivery PIN | Done | Customer sees a 4-digit PIN; the rider or shop must enter it. Lockout after 5 wrong tries. |
| Proof-of-delivery workflow | Partial | The PIN is the proof. There is no photo capture. |
| Restricted and prohibited goods excluded by policy | Done | Keyword screen when a product is added or edited. Try adding "beer" as a shop owner. |
| Standalone parcel requests (not tied to a shop order) | **Not built** | The MVP delivers marketplace orders only. |

## Section 4.3: Mobility services

**Not built, on purpose.** The proposal makes this "subject to local regulations and operator onboarding" and places it in Phase 5 behind "legal clearance". Building ride-hailing before that clearance would be the wrong order.

## Section 4.4: Differentiation

| Requirement | Status | Where to see it |
|---|---|---|
| Merchant-versus-platform delivery choice at checkout (the strongest initial differentiator) | **Done** | Basket screen: Pick up, Shop delivers, ORBIT rider, each with its price |

## Section 6: Revenue model

| Requirement | Status | Evidence |
|---|---|---|
| 8% commission on completed orders, excluding refunds and cancellations | Done | Ledger lines are written only when an order is delivered. Rule tests plus end-to-end tests. |
| ₦300 net contribution per completed platform delivery | Done | Customer pays ₦700, rider earns ₦400, ORBIT keeps ₦300 |
| Ride-hailing commission 10% | Not built | See section 4.3 |
| Merchant sales stay merchant revenue (ORBIT books only commission and fees) | Done | Admin KPIs report `platformRevenue` separately from `gmv` |

## Section 8: Operations and customer experience

The order workflow, step by step: **buyer browses, places and pays, merchant confirms stock and preparation time, buyer-selected fulfilment mode is assigned, courier or merchant updates status, recipient confirms delivery, settlement, rating and support.** All of it is built except "support" (see 4.1). The single end-to-end test `runs from checkout to PIN-confirmed delivery and settles the money exactly` walks it.

| Operational control | Status |
|---|---|
| Merchant identity checks | Partial: admin reviews submitted details; no ID or document upload |
| Courier documentation and onboarding | Partial: admin approval; no documents |
| Cancellation and refund rules | Done: customer until the shop confirms, shop before the order is ready (decline, or cancel if it cannot fulfil), automatic after 15 minutes unpaid |
| Dispute resolution | **Not built** |
| Payout reconciliation | Partial: ledger only; no bank payouts |
| Incident reporting | **Not built** |
| Customer support | **Not built** |
| Prohibited-goods enforcement | Done (see 4.2) |

## Section 9: Technology

| Proposed | Status | Notes |
|---|---|---|
| Vue 3 web storefront and merchant dashboard | Done | The same Vue app runs in a browser (`docker compose` serves it on port 8080); the merchant dashboard is the shop-owner role |
| Vue 3 + Ionic + Capacitor mobile app | Done | Android build steps are in the README. **Not built into an APK in the development environment.** |
| NestJS, TypeScript, modular, documented APIs | Done | `/docs` (Swagger) and `docs/API.md` |
| PostgreSQL | Done | **Tested:** the full API suite passes on PostgreSQL 16 (`npm run test:pg`) |
| PostGIS | Not built | No geospatial features in the MVP; riders pick from an open job board |
| Socket.IO | Done | Live updates for all four roles |
| Redis | Not built | Not needed on one server; needed for several instances |
| BullMQ background jobs | Not built | A simple in-process timer handles payment expiry |
| Containerised deployment | Partial | `Dockerfile`s and `docker-compose.yml` provided. **The container images were not built in the development environment** (no Docker daemon there); the build steps and the runtime configuration were reproduced and verified step by step. |
| Monitoring, backups, CI/CD | Not built | A `/api/health` endpoint exists |
| Role-based access | Done | Four roles, enforced on every route, with tests |
| MFA for privileged users | **Not built** | The admin signs in with a password only. This is the first thing to add before real use. |
| Encrypted transport | Deployment | Needs HTTPS in deployment; the Android config currently allows plain http for development |
| Audit logs | Partial | The settlement ledger is append-only in code; there is no general audit log of admin actions |
| Payment gateway integration | Not built | Mock, with the webhook interface ready |
| "Avoid claiming guaranteed sub-second telemetry without load testing" | Respected | No such claim is made; no load testing has been done |

## Section 10: Roadmap gates

| Phase | Gate in the proposal | Status |
|---|---|---|
| 1 Discovery and foundation | Repository, schemas, Docker environment | Done (Docker files unbuilt here) |
| 2 Marketplace MVP | "Successful end-to-end test orders" | **Done**: 26 API end-to-end tests, and a 17-step UI run through all four roles |
| 3 Logistics pilot | Courier onboarding, dispatch, waybills, delivery PIN, support; "reliable deliveries and reconciled payouts" | Mostly: dispatch, PIN, waybill number, onboarding done. Support and reconciled bank payouts not built. |
| 4 Mobile and hardening | Ionic apps, testing, security review, analytics | Partial: app and tests done; KPIs are the analytics. **No independent security review has been done**; the security design is documented in `ARCHITECTURE.md`. |
| 5 Mobility | Legal clearance first | Not built, on purpose |
| 6 Advanced | Recurring trips, pooling, premium features | Not built |

## Section 11: Financial plan

The proposal's illustrative figures (600 orders × ₦5,000 = ₦3,000,000 GMV, 8% = ₦240,000; 350 deliveries × ₦300 = ₦105,000) are reproduced by a unit test, so the software's rules match the plan's maths. **These remain planning assumptions.** The demo contains no historical orders, so no number in the admin KPIs is invented; they reflect only orders placed during the demonstration.

## Section 12: Key performance indicators

| KPI in the proposal | Status |
|---|---|
| Active merchants, listed SKUs, completed orders, GMV | Done |
| Repeat purchase rate, refund rate | Done |
| Conversion rate | **Not built**: needs visit tracking |
| Successful delivery rate | Done (as order completion rate) |
| Average delivery time | Done |
| On-time rate | **Not built**: the MVP has no promised delivery time to measure against |
| Cost per delivery, incident frequency | **Not built** |
| Net revenue, contribution margin per order | Done |
| Customer acquisition cost, merchant retention, monthly cash burn | **Not built**: these are business figures, not product data |
| Mobility KPIs | Not applicable until launch |

## Section 13: Risks and the mitigations that exist in the software

| Risk | Mitigation in the MVP |
|---|---|
| Merchant stock or quality problems | Verification, atomic stock reservation, ratings |
| Delivery failures and rider safety | Proof of delivery (PIN), job claiming rules. (Zones, training and insurance are operational, not software.) |
| Payment fraud and disputes | Signed webhook, amount check, idempotency, automatic refunds, append-only ledger |
| Data and privacy exposure | Role-based access, per-role redaction of personal details, 404 for orders you are not part of, hashed passwords. **There is no consent screen, privacy notice or data-retention policy**; the proposal calls for a Nigeria Data Protection Act review, which has not been done. |
| Transport regulation | Mobility not built |

---

## How to verify it yourself

| To see | Do this |
|---|---|
| The whole system working | Run it (README), then follow the 8-minute demo script |
| 38 API tests (rules plus 26 end-to-end) | `cd backend && npm test` |
| The same 26 end-to-end tests on **PostgreSQL** | `cd backend && npm run test:pg` (README explains the one-line database setup) |
| 12 app-logic tests | `cd mobile && npm test` |
| A full cross-role UI run with screenshots | `cd mobile && node e2e/ui-flow.cjs` (README lists the setup) |
| The API contract | `http://localhost:4000/docs` |
| The money rules | `backend/src/common/money.ts` (one pure function) and `backend/src/common/rules.spec.ts` |
| The security design | `docs/ARCHITECTURE.md`, sections 6 to 9 |
