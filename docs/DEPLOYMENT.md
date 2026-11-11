# Deploying ORBIT for real testing

Goal: course mates, shops, riders and vehicle owners install the app and use it. Payments stay in **test mode**.

## 1. Backend and database (Render)

1. Push this repo to GitHub (done).
2. On render.com choose **New > Blueprint**, select the repo. `render.yaml` creates the API (Docker) and a PostgreSQL database.
3. Fill the values it asks for:
   - `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`: your login. Pick a strong password, sign in, then change it.
   - `PUBLIC_BASE_URL`: the API's public address, e.g. `https://orbit-api.onrender.com`.
   - `CORS_ORIGINS`: comma-separated app origins: your Netlify address plus `https://localhost,capacitor://localhost` for the Android and iOS apps.
4. Deploy. Migrations run automatically at boot in production. Check `https://<api>/api/health`.

Free tier notes: the API sleeps after inactivity (first request is slow) and the free database expires after a period. Use a paid plan before relying on it.

### Pictures and documents must not live on the API's disk

Hosting disks are wiped on redeploy. Create an S3-compatible bucket pair (Cloudflare R2, Supabase Storage or AWS S3) and set:
`STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_REGION`, `S3_PUBLIC_BUCKET`, `S3_PRIVATE_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_BASE` (public URL of the public bucket). The private bucket holds ID and vehicle documents and must never be public.

### Email (password reset)

Set `SMTP_URL` (for example a Brevo or Resend SMTP URL) and `MAIL_FROM`. Without it, reset links are only logged.

## 2. Web app (Netlify)

New site from Git, base directory `mobile` (`mobile/netlify.toml` has the rest). Set `VITE_API_URL=https://<api>/api` and deploy. Share the link: testers can also use "Add to home screen".

## 3. Android APK

1. Repo **Settings > Secrets and variables > Actions > Variables**: add `API_URL` = `https://<api>/api`.
2. **Actions > Android APK > Run workflow**. Download `orbit-debug-apk` from the run, send the `.apk` to testers (they allow "install unknown apps").
3. For Play Store later you will need a release keystore; keep it out of git.

## 4. iOS and TestFlight

Needs an Apple Developer account. Create an app record (bundle id `ng.orbit.app`) in App Store Connect, create an App Store Connect API key, then add secrets `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` and the `API_URL` variable. Run **Actions > iOS TestFlight**. Invite testers in TestFlight. If the workflow's signing step fails, open `mobile/ios/App` in Xcode once (`npx cap add ios && npx cap open ios`) to set up signing, then retry.

## 5. Onboarding real testers

- Customers register themselves. Shops and drivers register, upload documents in the app, and appear in **Verify** on the admin tab; approve them there.
- Create your co-admins in **More > Admin team** (superadmin only).
- Tell testers the app is in test mode: payments are simulated.

## 6. Before real money or a public launch

Hardening list: real payment gateway and signed webhooks, rate limits tuned to traffic, a paid map provider, backups on the database, error monitoring, a privacy policy and terms reviewed by a lawyer, and driver background checks. See `docs/ARCHITECTURE.md`.

## Environment reference

See `backend/.env.example`. Required in production: `JWT_SECRET`, `PIN_SECRET`, `WEBHOOK_SECRET` (32+ characters each), `DATABASE_URL` and `DB_TYPE=postgres`, `CORS_ORIGINS`.
