/**
 * ORBIT smoke test: signs in as each demo role through the API, opens every main screen in a phone-sized
 * Chromium in light and dark, and fails on console errors, failed API calls or horizontal overflow.
 * Run with the API on :4000 (demo data) and the web build on :4173:   node e2e/smoke.cjs
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const WEB = process.env.WEB_URL || 'http://localhost:4173';
const API = process.env.API_URL || 'http://localhost:4000/api';
const DEMO = process.env.DEMO === '1'; // against a VITE_DEMO build: tokens are demo:<userId>, no API needed
const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const ROLES = {
  customer: { email: 'student@orbit.demo', routes: ['/c/home', '/c/shops', '/c/activity', '/c/account', '/c/book/ride', '/c/book/parcel', '/c/favourites', '/n'] },
  merchant: { email: 'nkechi@orbit.demo', routes: ['/m/orders', '/m/products', '/m/riders', '/m/shop', '/m/earnings'] },
  rider: { email: 'rider1@orbit.demo', routes: ['/r/drive', '/r/jobs', '/r/active', '/r/garage', '/r/earnings', '/r/account'] },
  admin: { email: 'admin@orbit.demo', routes: ['/a/queue', '/a/trips', '/a/safety', '/a/kpis', '/a/more', '/a/orders', '/a/promos'] },
};
const problems = [];

(async () => {
  const browser = await chromium.launch();
  for (const [role, cfg] of Object.entries(ROLES)) {
    const demoId = { customer: 'u_cust', merchant: 'u_merch', rider: 'u_rider', admin: 'u_admin' }[role];
    const body = DEMO ? { token: `demo:${demoId}` } : await (await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: cfg.email, password: 'Orbit@2026' }) })).json();
    if (!body.token) { problems.push(`${role}: login failed ${JSON.stringify(body).slice(0, 120)}`); continue; }
    for (const theme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: theme, geolocation: { latitude: 9.0765, longitude: 7.3986 }, permissions: ['geolocation'] });
      await ctx.addInitScript(([t, th]) => { localStorage.setItem('orbit.token', t); localStorage.setItem('orbit.theme', th); for (const n of ['customer','merchant','driver','admin']) localStorage.setItem('orbit.tour.' + n, '1'); }, [body.token, theme]);
      const page = await ctx.newPage();
      page.on('console', (m) => m.type() === 'error' && !/tile|openstreetmap|ERR_NAME|ERR_INTERNET|Failed to load resource.*(tile|osm)/i.test(m.text() + m.location().url) && problems.push(`${role}/${theme} console: ${m.text().slice(0, 160)}`));
      page.on('pageerror', (e) => problems.push(`${role}/${theme} pageerror: ${e.message.slice(0, 160)}`));
      page.on('response', (r) => !DEMO && r.url().startsWith(API) && r.status() >= 400 && problems.push(`${role}/${theme} ${r.status()} ${r.url()}`));
      for (const route of cfg.routes) {
        await page.goto(WEB + route, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2200);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
        if (overflow) problems.push(`${role}/${theme} ${route}: horizontal overflow`);
        const url = new URL(page.url()).pathname;
        if (url !== route) problems.push(`${role}/${theme} ${route}: redirected to ${url}`);
        await page.screenshot({ path: path.join(SHOTS, `${role}-${theme}-${route.replace(/\W+/g, '_')}.png`) });
      }
      await ctx.close();
    }
    console.log(`  done ${role}`);
  }
  await browser.close();
  console.log(problems.length ? `\n${problems.length} problem(s):\n` + [...new Set(problems)].join('\n') : '\nAll screens loaded clean.');
  process.exit(problems.length ? 1 : 0);
})();
