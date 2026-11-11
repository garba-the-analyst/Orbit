# ORBIT Security

Threat model, controls, test evidence, and known gaps for the ORBIT API and mobile app.

## Threat model

| Asset | Threat | Mitigation |
|-------|--------|------------|
| User accounts | Password guessing, credential stuffing | bcrypt cost 10, 5-failure lockout (15 min), generic login errors, rate limits (10/min on auth) |
| Sessions | Token theft, replay | Short-lived JWT (12h), password-version (`pv`) revocation on password change, per-request user reload from DB |
| Orders / trips | IDOR (user reads another's order) | Every route filters by ownership; 404 for records you are not a party to |
| Merchant catalogue | Merchant edits another shop's products | Shop-scoped queries; 404 when merchant touches another shop's product |
| Webhooks | Tampered / spoofed events | HMAC signature verification (constant-time compare), amount must match expected order total |
| Webhooks | Replay | Idempotent `handleEvent` — only a PENDING payment is ever changed |
| Payments | Underpayment / amount tampering | Webhook amount checked against the stored order total before settlement |
| Uploads | Non-image files, path traversal, SSRF | `sharp` re-encodes to WebP (strips metadata), content-type validated by magic bytes not filename, geo proxy targets only configured OSM/Nominatim/OSRM URLs |
| Socket data | Personal data leaked over WebSockets | Signals carry ids/status only; the one data-carrying signal (`courier.moved`) goes to a single user's room |
| Admin actions | Unauthorised mutations | Role guards, `SuperAdminOnly()` for admin management, audit log on every mutating admin route |
| Password reset | Token abuse | Single-use reset tokens, 30-minute TTL, same generic response whether or not the email exists |
| Data privacy | Unauthorised export/delete | Export/delete require the account's own password; superadmin can't be deleted from the app |

## Controls

### Authentication
- Passwords hashed with bcrypt (cost 10); hashes never leave the server.
- Login uses one generic error for "no such user" and "wrong password", and always runs a hash comparison (timing-equalised), so neither message nor timing reveals whether an email exists.
- Five failed logins lock the account for 15 minutes.
- Auth routes are rate-limited (10 requests/minute); all other routes 240/minute.
- JWT carries a password version (`pv`). Changing a password signs out every other device immediately (tokens stop validating on the next request).
- Admin creation is superadmin-only, capped at six other admins; new admins get a temporary password and `mustChangePassword = true` — they can only use `/me` and `/me/password` until they change it.
- The superadmin is created from `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` (git-ignored `.env` or host dashboard) on first boot. An existing account is never promoted to superadmin.

### Authorisation
- Global `JwtAuthGuard` + `RolesGuard` on every route; `@Public()` opts out.
- Role-restricted routes additionally require `ACTIVE` status (merchants/riders awaiting admin verification cannot operate).
- Every data route filters by ownership: a customer can only read their own orders/trips, a merchant only their own shop/products, a rider only their own jobs/vehicles.
- Cross-user access returns 404 ("not found, or not yours"), not 403, so the existence of another user's record is not disclosed.

### Input validation
- Class-validator DTOs with `whitelist: true` and `forbidNonWhitelisted: true` — unknown fields are rejected with 400.
- Money is whole currency units; prices are never accepted from the client (all charges computed server-side).
- Phone numbers validated against market-specific formats (NG: `0803…` / `+234803…`).
- Passwords: 8–72 characters, at least one letter and one number.

### Uploads (pictures and documents)
- Files are validated by magic bytes via `sharp` (JPEG/PNG/WebP only), never by filename or declared MIME type.
- Images are re-encoded to WebP, EXIF/orientation stripped, resized to defined shapes (avatar 512×512, product 1600×1600, etc.).
- A client-submitted image URL must be one the account uploaded (`assertOwned`) — prevents tracking pixels and hotlinking.
- Private documents (ID, vehicle papers) go to a private bucket/directory and are never served publicly. `STORAGE_DRIVER=s3` for hosted deployments (public bucket + private bucket).

### Transport and headers
- Helmet (CSP disabled only because Swagger UI needs inline scripts).
- CORS: development allows all origins; production allows only `CORS_ORIGINS`.
- Capacitor config serves `https` only by default (`cleartext` opt-in via `CAP_CLEARTEXT=true` for local LAN testing).
- No secrets in the bundle; API URL comes from `VITE_API_URL` at build time.

### Sockets (Socket.IO)
- Clients authenticate during the handshake with a bearer JWT; unauthenticated sockets are disconnected.
- Each socket joins a per-user room (`user:<id>`). Riders additionally join the `riders` broadcast room; admins join `admins`.
- Signals carry ids and status only (`order.updated`, `trip.updated`, `jobs.changed`, `notification.new`, `account.updated`).
- The only data-carrying signal is `courier.moved` (lat/lng/heading), sent only to the customer whose job the courier is on — never broadcast.

### Privacy
- Data export (`GET /me/export`) returns all personal data the account holds (files excluded; document metadata listed).
- Account deletion (`POST /me/delete`) requires the account password, suspends shops, anonymises the user record, and revokes all tokens via `passwordChangedAt`.
- Consent is captured at sign-up (`acceptTerms`, `termsVersion`); required in production.
- Audit log (`GET /admin/audit`) records every mutating admin action: who, what route, which target, which fields. Only a short allow-list of fields is logged (never passwords or documents).
- Structured logs contain no PII.

### Operations
- `npm audit` clean; dependencies pinned via `package-lock.json`.
- Dockerfile runs as non-root (`USER node`).
- Production refuses to boot with weak or missing secrets (`JWT_SECRET`, `PIN_SECRET`, `WEBHOOK_SECRET` must be 32+ characters).
- Production refuses SQLite; requires `DB_TYPE=postgres` and `DATABASE_URL`.
- Payments stay in **test mode** (`PAYMENT_PROVIDER=mock`) until `ALLOW_MOCK_PAYMENTS=true` is explicitly set for a supervised demo. A real gateway (Paystack) is available behind `PAYMENT_PROVIDER=paystack` and is **off by default**.

## Test evidence

Security tests live in `backend/test/security.e2e.spec.ts` (5 tests, all passing):

| Test | Proves |
|------|--------|
| Customer A cannot read customer B's order | IDOR on orders (404 for another user's order) |
| Customer A cannot read customer B's trip | IDOR on trips (404 for another user's trip) |
| Temporary-password admin gated | `mustChangePassword` blocks all routes except `/me` and `/me/password` (403), then 401 after revocation |
| Password change revokes old JWT | `pv` mismatch → 401 on the old token; fresh token works |
| Non-image upload rejected | `sharp` content validation rejects non-pictures regardless of filename (400) |

Run with: `cd backend && npm test` (165 tests, 11 suites, all passing).

## Known gaps

| Gap | Status | Plan |
|-----|--------|------|
| No MFA for admins | Not built | Proposal section 13 lists MFA as the first hardening item before real use |
| No general admin audit-log viewer screen | API route exists (`GET /admin/audit`); mobile screen not built | Add mobile admin audit screen |
| No document upload for merchant/rider verification | Admin reviews details; no ID/document collection | Add document upload + verification workflow |
| No payment reconciliation report screen | Ledger exists; no reconciliation UI | Add reconciliation report |
| Paystack adapter not live | `PAYMENT_PROVIDER=paystack` implemented but off by default | Enable with test keys for pilot, live keys for production |
| Rate limits not tuned to production traffic | Defaults (240/min global, 10/min auth) | Tune after pilot usage patterns are known |

## Environment secrets (never commit)

`JWT_SECRET`, `PIN_SECRET`, `WEBHOOK_SECRET` (32+ chars each), `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `DATABASE_URL`, `DB_SSL=true`, `PAYSTACK_SECRET_KEY` / `PAYSTACK_PUBLIC_KEY` (only when `PAYMENT_PROVIDER=paystack`).
