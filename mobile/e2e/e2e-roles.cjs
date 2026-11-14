/**
 * ORBIT end-to-end UI test: all four user roles.
 *
 * Drives the real app in phone-sized Chromium against a running API and web build.
 * Tests customer, merchant, rider, and admin flows end-to-end.
 *
 * Run (API on :4000 with demo data, web on :4173):
 *     node e2e/e2e-roles.cjs
 * Environment: WEB_URL, SHOTS, SCALE
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const WEB = process.env.WEB_URL || 'http://localhost:4173';
const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots');
const SCALE = Number(process.env.SCALE || 1);
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const problems = [];
const pages = {};

async function step(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok    ${name}`);
  } catch (e) {
    results.push({ name, ok: false, error: e.message.split('\n')[0] });
    console.log(`  FAIL  ${name}\n        ${e.message.split('\n')[0]}`);
    for (const [label, page] of Object.entries(pages)) {
      try {
        await page.screenshot({ path: path.join(SHOTS, `FAIL-${label}.png`) });
        const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300);
        console.log(`        [${label}] ${page.url()}  "${text}"`);
      } catch { /* page may be closed */ }
    }
    throw e;
  }
}

async function person(browser, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SCALE });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) return;
    problems.push(`[${label}] console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  await page.goto(WEB + '/', { waitUntil: 'networkidle' });
  pages[label] = page;
  return page;
}

const shot = async (page, name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};
const visibleText = (page, text) => page.getByText(text, { exact: false }).locator('visible=true').first();
const expectText = async (page, text, timeout = 10000) => visibleText(page, text).waitFor({ state: 'visible', timeout });
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(name) }).first();
const demo = (page, label) => page.getByRole('button', { name: label, exact: false }).first().click();

(async () => {
  const browser = await chromium.launch();
  let customer, merchant, rider, admin;
  let pin = '';

  try {
    // ========================================================================
    // CUSTOMER
    // ========================================================================
    console.log('CUSTOMER: browse, order, pay, track, PIN, rate, complain');
    customer = await person(browser, 'customer');

    await step('customer signs in', async () => {
      await demo(customer, 'Customer');
      await customer.waitForURL('**/c/shops');
      await expectText(customer, 'Shops near campus');
    });

    await step('customer searches and opens a shop', async () => {
      await customer.getByPlaceholder('Search shops or products').fill('jollof');
      await expectText(customer, 'Mama Nkechi');
      await customer.getByText('Mama Nkechi', { exact: false }).first().click();
      await customer.waitForURL('**/c/shop/**');
      await expectText(customer, 'Jollof rice and chicken');
      await shot(customer, 'c-search-shop');
    });

    await step('customer adds items and goes to basket', async () => {
      await customer.getByRole('button', { name: 'Add one Jollof rice and chicken' }).click();
      await customer.getByRole('button', { name: 'Add one Moi moi' }).click();
      await expectText(customer, 'View basket');
      await customer.getByRole('button', { name: 'View basket' }).click();
      await customer.waitForURL('**/c/basket');
      await expectText(customer, 'How should it reach you?');
      await shot(customer, 'c-basket');
    });

    await step('customer chooses ORBIT rider delivery and pays', async () => {
      await customer.locator('label.opt', { hasText: 'ORBIT rider' }).locator('visible=true').click();
      await customer.getByPlaceholder('Hostel A, Room 12').fill('Hostel A, Room 12');
      await expectText(customer, '₦7,100');
      await customer.getByRole('button', { name: 'Pay ₦7,100' }).click();
      await customer.waitForURL('**/c/pay/**');
      await expectText(customer, 'Test mode');
      await customer.getByRole('button', { name: 'Pay ₦7,100' }).click();
      await customer.waitForURL('**/c/order/**');
      await expectText(customer, 'Order sent');
      await shot(customer, 'c-order-placed');
    });

    await step('customer sees the 4-digit delivery PIN', async () => {
      pin = (await customer.locator('.digits span').allInnerTexts()).join('');
      if (!/^\d{4}$/.test(pin)) throw new Error(`PIN malformed: "${pin}"`);
      await shot(customer, 'c-pin');
    });

    await step('customer files a complaint', async () => {
      await customer.getByRole('button', { name: 'Account' }).click();
      await customer.waitForURL('**/c/account');
      await customer.getByRole('button', { name: 'Report a problem' }).click();
      await customer.waitForURL('**/c/complaints');
      await customer.getByRole('button', { name: 'ORBIT rider' }).click(); // select category
      await customer.getByPlaceholder(/Subject/).fill('Late delivery');
      await customer.getByPlaceholder(/What happened/).fill('The rider took too long.');
      await customer.getByRole('button', { name: 'Submit complaint' }).click();
      await expectText(customer, 'Complaint submitted');
      await shot(customer, 'c-complaint-filed');
    });

    await step('customer rates the shop', async () => {
      await customer.getByRole('radio', { name: '5 out of 5' }).click();
      await customer.getByRole('button', { name: 'Send rating' }).click();
      await expectText(customer, 'You rated this order');
      await shot(customer, 'c-rated');
    });

    // ========================================================================
    // MERCHANT
    // ========================================================================
    console.log('MERCHANT: see order, accept, mark ready, earnings');
    merchant = await person(browser, 'merchant');

    await step('merchant signs in and sees new order', async () => {
      await demo(merchant, 'Merchant');
      await merchant.waitForURL('**/m/orders');
      await expectText(merchant, '₦5,888');
      await shot(merchant, 'm-new-order');
    });

    await step('merchant accepts the order', async () => {
      await merchant.getByRole('button', { name: 'Accept order' }).click();
      await expectText(merchant, 'Mark ready');
    });

    await step('merchant marks ready', async () => {
      await merchant.getByRole('button', { name: 'Mark ready' }).click();
      await expectText(merchant, 'coming to collect');
      await shot(merchant, 'm-ready');
    });

    await step('merchant sees earnings', async () => {
      await tab(merchant, 'Earnings').click();
      await expectText(merchant, '₦5,888');
      await shot(merchant, 'm-earnings');
    });

    // ========================================================================
    // RIDER
    // ========================================================================
    console.log('RIDER: accept job, collect, deliver with PIN, earnings');
    rider = await person(browser, 'rider');

    await step('rider accepts the job (address hidden)', async () => {
      await demo(rider, 'Rider');
      await rider.waitForURL('**/r/jobs');
      await expectText(rider, 'Accept job');
      const hidden = await rider.getByText('Hostel A').count();
      if (hidden !== 0) throw new Error('rider saw address before accepting');
      await shot(rider, 'r-jobs');
      await rider.getByRole('button', { name: 'Accept job' }).first().click();
      await rider.waitForURL('**/r/active');
      await expectText(rider, 'Hostel A, Room 12');
      await shot(rider, 'r-active');
    });

    await step('rider collects and delivers with PIN', async () => {
      await expectText(rider, 'I have collected the order', 15000);
      await rider.getByRole('button', { name: 'I have collected the order' }).click();
      await expectText(rider, 'Complete delivery with PIN');
      await shot(rider, 'r-collected');

      // wrong PIN refused
      await rider.getByRole('button', { name: 'Complete delivery with PIN' }).click();
      const wrong = pin === '0000' ? '1111' : '0000';
      await rider.getByLabel('4-digit delivery PIN').fill(wrong);
      await expectText(rider, 'not right');
      await shot(rider, 'r-pin-wrong');

      // right PIN completes
      await rider.getByRole('button', { name: 'Complete delivery with PIN' }).click();
      await rider.getByLabel('4-digit delivery PIN').fill(pin);
      await expectText(rider, 'Delivered. ₦400 added');
      await shot(rider, 'r-delivered');
    });

    await step('rider sees earnings', async () => {
      await tab(rider, 'Earnings').click();
      await expectText(rider, '₦400');
      await shot(rider, 'r-earnings');
    });

    // ========================================================================
    // ADMIN / SUPERADMIN
    // ========================================================================
    console.log('ADMIN: queue, KPIs, complaints, create admin');
    admin = await person(browser, 'admin');

    await step('admin signs in and sees verification queue', async () => {
      await demo(admin, 'ORBIT admin');
      await admin.waitForURL('**/a/queue');
      await expectText(admin, 'Maryam');
      await shot(admin, 'a-queue');
    });

    await step('admin approves the waiting rider', async () => {
      await tab(admin, 'Verify').click();
      await admin.getByRole('button', { name: 'Approve rider' }).click();
      await expectText(admin, 'approved');
    });

    await step('admin sees KPIs', async () => {
      await tab(admin, 'KPIs').click();
      await expectText(admin, 'Pilot numbers');
      await expectText(admin, '₦812');
      await shot(admin, 'a-kpis');
    });

    await step('admin sees complaints', async () => {
      await tab(admin, 'Complaints').click();
      await expectText(admin, 'Late delivery');
      await shot(admin, 'a-complaints');
    });

    await step('admin resolves the complaint', async () => {
      await admin.getByRole('button', { name: 'Resolve' }).click();
      await admin.getByPlaceholder(/What was done/).fill('Delivery delay refunded.');
      await admin.getByRole('button', { name: 'Mark resolved' }).click();
      await expectText(admin, 'Resolved');
      await shot(admin, 'a-complaint-resolved');
    });

    await step('admin creates a new admin', async () => {
      await tab(admin, 'More').click();
      await admin.getByRole('button', { name: 'Add an admin' }).click();
      await admin.getByPlaceholder('Full name').fill('Test Admin');
      await admin.getByPlaceholder('Email').fill('testadmin@orbit.test');
      await admin.getByPlaceholder('Phone').fill('08031239999');
      await admin.getByPlaceholder('Temporary password').fill('TestPass1234');
      await admin.getByRole('button', { name: 'Add admin' }).click();
      await expectText(admin, 'Test Admin added');
      await shot(admin, 'a-admin-created');
    });

    await step('admin suspends and reactivates an admin', async () => {
      await admin.getByRole('button', { name: 'Suspend' }).first().click();
      await expectText(admin, 'suspended');
      await admin.getByRole('button', { name: 'Reactivate' }).first().click();
      await expectText(admin, 'active');
      await shot(admin, 'a-admin-toggle');
    });

  } catch {
    /* already reported by step() */
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  if (problems.length) {
    console.log(`\nBrowser problems (${problems.length}):`);
    [...new Set(problems)].slice(0, 15).forEach((p) => console.log('  - ' + p));
  }
  process.exit(failed.length || problems.length ? 1 : 0);
})();
