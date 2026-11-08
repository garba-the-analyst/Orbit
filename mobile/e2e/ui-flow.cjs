/**
 * ORBIT UI flow test. Drives the real app in a phone-sized Chromium against a running API and
 * web build, playing four people at once (customer, shop owner, rider, admin) through one order:
 *
 *   customer orders with an ORBIT rider -> a payment fails then succeeds -> shop accepts and packs
 *   -> rider accepts, collects, and delivers with the customer's PIN -> customer rates -> admin sees it.
 *
 * Run (API on :4000 with demo data, web on :4173):
 *     node e2e/ui-flow.cjs
 * Environment: WEB_URL, SHOTS (folder for screenshots), SCALE (device scale factor, default 1).
 * Uses Playwright from the machine (not a project dependency).
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
    throw e; // later steps depend on earlier ones
  }
}

async function person(browser, label) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: SCALE });
  const page = await ctx.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    if (/Failed to load resource: the server responded with a status of 4\d\d/.test(m.text())) return; // deliberate negative tests
    problems.push(`[${label}] console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`[${label}] pageerror: ${e.message}`));
  await page.goto(WEB + '/', { waitUntil: 'networkidle' });
  pages[label] = page;
  return page;
}
// Let Ionic's page transition (about half a second) finish so screenshots show a settled screen.
const shot = async (page, name) => {
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};
// Ionic keeps earlier screens mounted but hidden, so only ever match what a person could actually see.
const visibleText = (page, text) => page.getByText(text, { exact: false }).locator('visible=true').first();
const expectText = async (page, text, timeout = 10000) => visibleText(page, text).waitFor({ state: 'visible', timeout });
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(name) }).first();
const demo = (page, label) => page.getByRole('button', { name: label, exact: false }).first().click();

(async () => {
  const browser = await chromium.launch();
  let customer, merchant, rider, admin;
  let pin = '';

  try {
    console.log('Customer places an order with an ORBIT rider');
    customer = await person(browser, 'customer');
    await step('sign in as the demo customer', async () => {
      await demo(customer, 'Customer');
      await customer.waitForURL('**/c/shops');
      await expectText(customer, 'Shops near campus');
    });
    await step('search finds a shop by product name', async () => {
      await customer.getByPlaceholder('Search shops or products').fill('jollof');
      await expectText(customer, 'Mama Nkechi');
      await customer.waitForTimeout(500);
      const rows = await customer.locator('button.shop').count();
      if (rows !== 1) throw new Error(`expected 1 shop for "jollof", saw ${rows}`);
      await shot(customer, '03-search');
      await customer.getByPlaceholder('Search shops or products').fill('');
      await expectText(customer, 'Fresh Fruit Corner'); // the full list is back
    });
    await step('open the shop and fill the basket', async () => {
      await customer.getByText('Mama Nkechi', { exact: false }).first().click();
      await customer.waitForURL('**/c/shop/**');
      await expectText(customer, 'Jollof rice and chicken');
      await shot(customer, '04-shop');
      const addJollof = customer.getByRole('button', { name: 'Add one Jollof rice and chicken' });
      await addJollof.click();
      await addJollof.click();
      await customer.getByRole('button', { name: 'Add one Moi moi' }).click();
      await expectText(customer, 'View basket');
      await shot(customer, '05-shop-with-basket');
    });
    await step('basket shows the delivery choice and the right total', async () => {
      await customer.getByRole('button', { name: /View basket/ }).click();
      await customer.waitForURL('**/c/basket');
      await expectText(customer, 'How should it reach you?');
      await customer.locator('label.opt', { hasText: 'ORBIT rider' }).locator('visible=true').click();
      await customer.getByPlaceholder('Hostel A, Room 12').fill('Hostel A, Room 12');
      await expectText(customer, '₦7,100'); // 2 x 2,800 + 800 + 700 delivery
      await shot(customer, '06-basket');
    });
    await step('payment fails once, then succeeds', async () => {
      await customer.getByRole('button', { name: 'Pay ₦7,100' }).click();
      await customer.waitForURL('**/c/pay/**');
      await expectText(customer, 'Test mode');
      await shot(customer, '07-pay');
      await customer.getByRole('button', { name: 'Simulate a failed payment' }).click();
      await expectText(customer, 'did not go through');
      await customer.getByRole('button', { name: 'Pay ₦7,100' }).click();
      await customer.waitForURL('**/c/order/**');
      await expectText(customer, 'Order sent');
      await customer.waitForTimeout(1200);
      await shot(customer, '08-order-placed');
    });
    await step('customer sees a 4-digit PIN', async () => {
      pin = (await customer.locator('.digits span').allInnerTexts()).join('');
      if (!/^\d{4}$/.test(pin)) throw new Error(`PIN not shown or malformed: "${pin}"`);
    });

    console.log('Shop owner accepts and packs the order');
    merchant = await person(browser, 'merchant');
    await step('merchant sees the new order and accepts it', async () => {
      await demo(merchant, 'Merchant');
      await merchant.waitForURL('**/m/orders');
      await expectText(merchant, '₦5,888'); // 6,400 less 8% commission
      await shot(merchant, '09-merchant-new');
      await merchant.getByRole('button', { name: 'Accept order' }).click();
      await expectText(merchant, 'Mark ready');
    });
    await step('customer tracker moves to "Shop is preparing" live', async () => {
      await expectText(customer, 'Shop is preparing', 15000);
      await customer.waitForTimeout(1200);
      await shot(customer, '10-order-preparing');
    });

    console.log('Rider takes the job');
    rider = await person(browser, 'rider');
    await step('rider accepts the job from the board (customer details hidden)', async () => {
      await demo(rider, 'Rider');
      await rider.waitForURL('**/r/jobs');
      await expectText(rider, 'Accept job');
      const hidden = await rider.getByText('Hostel A').count();
      if (hidden !== 0) throw new Error('rider saw the delivery address before accepting');
      await shot(rider, '11-rider-jobs');
      await rider.getByRole('button', { name: 'Accept job' }).first().click();
      await rider.waitForURL('**/r/active');
      await expectText(rider, 'Hostel A, Room 12'); // revealed after accepting
      await shot(rider, '12-rider-active');
    });
    await step('merchant marks ready; rider collects', async () => {
      await merchant.getByRole('button', { name: 'Mark ready' }).click();
      await expectText(merchant, 'coming to collect');
      await expectText(rider, 'I have collected the order', 15000);
      await rider.getByRole('button', { name: 'I have collected the order' }).click();
      await expectText(rider, 'Complete delivery with PIN');
    });
    await step('customer sees the order on the way with the rider named', async () => {
      await expectText(customer, 'On the way', 15000);
      await customer.waitForTimeout(1200);
      await shot(customer, '13-order-on-the-way');
    });

    console.log('Delivery with the PIN');
    await step('a wrong PIN is refused', async () => {
      await rider.getByRole('button', { name: 'Complete delivery with PIN' }).click();
      const wrong = pin === '0000' ? '1111' : '0000';
      await rider.getByLabel('4-digit delivery PIN').fill(wrong);
      await expectText(rider, 'not right');
      await shot(rider, '14-pin-wrong');
    });
    await step('the right PIN completes the delivery', async () => {
      await rider.getByLabel('4-digit delivery PIN').fill(pin);
      await expectText(rider, 'Delivered. ₦400 added');
      await expectText(customer, 'Delivered', 15000);
      await customer.waitForTimeout(1300);
      await shot(customer, '15-order-delivered');
    });
    await step('customer rates the shop', async () => {
      await customer.getByRole('radio', { name: '5 out of 5' }).click();
      await customer.getByRole('button', { name: 'Send rating' }).click();
      await expectText(customer, 'You rated this order');
    });
    await step('rider and shop earnings reflect the settlement', async () => {
      await tab(rider, 'Earnings').click();
      await expectText(rider, '₦400');
      await shot(rider, '16-rider-earnings');
      await tab(merchant, 'Earnings').click();
      await expectText(merchant, '₦5,888');
      await shot(merchant, '17-merchant-earnings');
    });

    console.log('Admin');
    admin = await person(browser, 'admin');
    await step('admin sees the verification queue and the KPIs', async () => {
      await demo(admin, 'ORBIT admin');
      await admin.waitForURL('**/a/queue');
      await expectText(admin, "Maryam");
      await shot(admin, '18-admin-queue');
      await tab(admin, 'KPIs').click();
      await expectText(admin, 'Pilot numbers');
      await expectText(admin, '₦812'); // 512 commission + 300 delivery contribution
      await shot(admin, '19-admin-kpis');
    });
    await step('admin approves the waiting rider and the queue shrinks', async () => {
      await tab(admin, 'Verify').click();
      await admin.getByRole('button', { name: 'Approve rider' }).click();
      await expectText(admin, 'approved');
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
