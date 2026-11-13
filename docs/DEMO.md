# ORBIT demo mode (no server, no database, no login)

For showcases and for teammates who just want to explore every workflow. The demo build of the app carries its own fake backend, so **nothing is hosted and nobody needs the internet or your computer**. Real builds are unaffected: the demo is switched on only by the build flag `VITE_DEMO=true`.

## How people use it
Open the demo link (or install the demo APK). On the sign-in screen tap a demo account: **Customer, Shop owner, Driver (motorbike), Haulier (truck), Admin**. Use Account > Reset demo data to start fresh.

## What is simulated
- **Customer:** order from shops across Nigeria; the shop confirms, prepares and a courier delivers on the map. Book rides, parcels and freight; a driver accepts, arrives, drives the route (live on the map) and completes. PINs are shown, payments are test mode.
- **Shop owner:** two customer orders are waiting. Accept, mark ready, send out with a personal rider or ORBIT delivery, enter any 4-digit PIN to complete. Catalogue, shop settings and riders all work.
- **Driver and haulier:** go online and a request arrives about every 10 seconds. Accept, arrive, start (any 4-digit PIN), complete. Jobs from shops appear on the Jobs tab.
- **Admin:** verify a waiting shop and driver, review documents and vehicles, see trips and orders, resolve the open SOS alert, create promo codes, add admins, see KPIs.
- When you are the shop or the driver yourself, the simulated version of that person steps aside so you can do the step by hand.

## Limits (be honest with your audience)
- Data lives in the browser or app of the person using it. Two people do not see each other's orders.
- Maps tiles need internet; the routes drawn are straight-ish estimates, not real roads.
- Uploaded pictures stay on the device.

## Get it online for free (GitHub Pages)
1. Repo **Settings > Pages > Source: GitHub Actions**.
2. Push to `main` (or run **Actions > Demo web app > Run workflow**). The link is `https://<username>.github.io/Orbit/`.
3. Share the link. On a phone, "Add to Home Screen" makes it behave like an app.

## Demo APK
**Actions > Android APK > Run workflow** with "demo" ticked, then download `orbit-demo-apk`. Testers allow "install unknown apps". For iOS use the web link, or TestFlight later.

## Build it yourself
```bash
cd mobile
VITE_DEMO=true npm run build        # web
VITE_DEMO=true npm run dev          # local
DEMO=1 node e2e/smoke.cjs           # screen check against the demo build (vite preview on :4173)
```
