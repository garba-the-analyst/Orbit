# ORBIT: build handoff prompt for a coding agent

Paste the block below into the agent. It is also the standing brief for this repo.

---

You are continuing the build of **ORBIT**, a nationwide (Nigeria first; Ghana, Kenya, South Africa configured) marketplace, delivery and ride-hailing platform. It is an ENT 312 Venture Creation project for a student, "Garba the Analyst", who needs it production-ready for real remote testing and impressive to a supervisor. Repo: https://github.com/garba-the-analyst/Orbit.git (branch `main`). Work in large, quality batches, run checks after each, commit often with clear messages, and push.

## 1. Read first
`README.md`, `docs/ARCHITECTURE.md` (esp. section 13), `docs/DEPLOYMENT.md`, `docs/API.md`, `docs/DESIGN.md`, `backend/.env.example`, `neon.ts`.

## 2. What exists (do not rebuild)
- `backend/`: NestJS 11, TypeORM, SQLite (dev) or PostgreSQL (`DB_TYPE=postgres`), Socket.IO, Swagger at `/docs`. Modules: auth, users, shops/products, orders, payments (test-mode mock), ledger, trips (ride-hailing: surge with price lock, wave dispatch, PINs, SOS, share links, tips, ratings, cancel fees), fleet/vehicles/documents, geo (Nominatim + OSRM proxy with fallback), notifications, admin (verification, KPIs, promos, superadmin creates up to 6 admins), audit, consent, data export/delete, password reset, S3/local storage. 160 Jest tests pass on SQLite and PostgreSQL. A PostgreSQL migration exists in `backend/src/database/migrations` (CI checks for drift).
- `mobile/`: Vue 3 + Ionic Vue 8 + Capacitor 8 + Pinia + Leaflet (OSM) + driver.js. Roles: customer, merchant, rider/driver (light and heavy fleets), admin/superadmin. Splash, skeletons, notifications, tours, dark mode, live maps. `npm run build` type-checks and builds.
- `.github/workflows/`: `ci.yml`, `android.yml` (debug APK), `ios-testflight.yml`.
- Smoke test: `mobile/e2e/smoke.cjs` (every role and main screen, light and dark). Run with the API on :4000 and `vite preview` on :4173, `NODE_PATH=$(npm root -g) node e2e/smoke.cjs`.

## 3. Hard rules (never break)
- **Secrets:** never commit `.env`, tokens, passwords, connection strings or keystores. The superadmin credentials live only in the git-ignored `backend/.env` (`SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`) or the host dashboard. Never promote an existing account to superadmin. Scan staged files for secrets before every commit.
- Money is whole currency units; every record carries its currency (NGN, GHS, KES, ZAR). Marketplace commission 8%, trip commission 10%.
- Payments stay **test mode** and clearly labelled until a real gateway is added.
- Keep the design tokens in `mobile/src/theme/tokens.css`; no hardcoded colours; light and dark must both work; respect reduced motion.
- Every change keeps `npm test` (backend), `npm run build` (mobile) and the smoke test green.

## 4. Tasks, in order

### A. Database and hosting (Neon + Render)
1. On a machine with internet: `npm i -g neon@latest`, `neon login`, `neon deploy` in the repo root (links project `tiny-tree-53680689`, branch `production`, org `org-noisy-thunder-42744956`). It writes `.env.local`; keep it git-ignored.
2. Use the **pooled** Neon connection string as `DATABASE_URL` with `DB_TYPE=postgres`, `DB_SSL=true`, `NODE_ENV=production`. Migrations run at boot. Do not seed in production.
3. Decide Neon Auth: ORBIT has its own JWT auth, so do **not** adopt Neon Auth; remove `auth: true` from `neon.ts` unless asked otherwise.
4. Object storage: if Neon's bucket is S3-compatible, map its variables to `STORAGE_DRIVER=s3` (`S3_ENDPOINT`, `S3_REGION`, `S3_PUBLIC_BUCKET`, `S3_PRIVATE_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE`). The private bucket (ID and vehicle documents) must never be public. Prove with a real upload and download through the API.
5. Prove end to end: boot the API in production mode against Neon, confirm `/api/health`, superadmin sign-in, register a customer, upload a picture, create a trip quote. Report command output.
6. Deploy the API to Render with `render.yaml` (Frankfurt). Set `CORS_ORIGINS` (web origin, `https://localhost`, `capacitor://localhost`), `PUBLIC_BASE_URL`, `SMTP_URL`, `MAIL_FROM`, `APP_URL`. Deploy the web app to Netlify with `VITE_API_URL=https://<api>/api`.

### B. Native app workflows
1. Android: make `android.yml` produce a **signed release** APK/AAB when a keystore secret exists (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`), debug APK otherwise. Add app icons and splash generated from the ORBIT mark (`@capacitor/assets`), permissions for location and camera, `https` scheme only. Test the APK on an emulator if possible.
2. iOS: verify `ios-testflight.yml`; add Info.plist usage strings for location, camera and photos; document Apple setup in `docs/DEPLOYMENT.md`.
3. Use the repository variable `API_URL`. Tag-based releases (`v*`) attach the APK to a GitHub Release.

### C. Security hardening (the student asked for this after the build works)
Do a real review and fix findings, adding tests for each:
- Auth: JWT secret strength checks, token expiry, `pv` revocation on password change, brute-force limits on login/reset/PIN, account enumeration on login and reset, mustChangePassword gating everywhere.
- Authorisation: role and ownership checks on every endpoint (IDOR tests: customer A reading customer B's order, trip, document, notification; merchant touching another shop; rider seeing masked jobs).
- Input: DTO validation whitelist, upload type/size/magic-byte checks, image re-encoding, path traversal, SSRF in the geo proxy, SQL injection (TypeORM parameters), XSS in user-entered text on the web app, CSV/export safety.
- Transport and headers: helmet, strict CORS, HTTPS-only, secure Capacitor config, no secrets in the bundle.
- Sockets: authenticate the handshake, per-user rooms, no data leaks in signals (only `courier.moved` carries coordinates).
- Privacy: data export/delete correctness, consent versions, audit log coverage, retention of documents, PII in logs.
- Operations: rate limits tuned, structured logs without PII, `npm audit` fixes, dependency pinning, Dockerfile runs as non-root.
Produce `docs/SECURITY.md` (threat model, controls, test evidence, known gaps).

### D. Product polish and gaps
- Merchant/driver flows through the real UI with Playwright (order with shop rider, ORBIT rider, pickup; ride booking with PIN; parcel and freight; cancel and refund paths; promo). Extend `e2e/` and make it part of CI against a seeded SQLite API.
- Paystack adapter behind the existing payment-provider interface (keep test mode default, behind `PAYMENT_PROVIDER=paystack`), with signed webhook verification and idempotency. Do not enable by default.
- Offline/poor-network behaviour, retry with backoff, optimistic UI where safe, push notifications (FCM/APNs via Capacitor) in addition to the in-app ones.
- Accessibility pass (labels, focus, contrast in both themes) and performance (split the large `endpoints` chunk, lazy-load Leaflet and driver.js, image sizes).
- Multi-country: GH, KE, ZA phone formats, currency, map centres, demo data per market behind `ENABLED_MARKETS`.
- Admin audit-log viewer screen (the API route exists: `GET /admin/audit`).

### E. Documentation and demo
Keep `README.md`, `docs/*` truthful (no claims of traction, no unbuilt features). Add a 10-minute demo script and screenshots for the supervisor. Update `docs/ASSESSOR-CHECKLIST.md`.

## 5. How to work
- Plan, then execute in batches. After each batch run: `cd backend && npm test && npx tsc --noEmit`; `cd mobile && npm run build`; smoke test. Fix before moving on.
- Prefer small, reviewable commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`). Push to `main` or a branch and open a PR if branch protection exists.
- When something is not verifiable in your environment (device builds, third-party consoles), say so plainly in your report; never claim it worked.
- Finish each session with a short report: what changed, evidence (command output), what failed, and the next step.
