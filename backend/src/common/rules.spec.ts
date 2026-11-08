/** Unit tests for the pure business rules: money, delivery PIN, webhook signature, prohibited goods. */
import { createHmac } from 'node:crypto';
import { Fulfilment } from './enums';
import { computeCharges } from './money';
import { derivePin, pinMatches, signatureMatches } from './pin.util';
import { findProhibitedTerm } from './prohibited-goods.policy';

const rules = { commissionBps: 800, orbitDeliveryFee: 700, courierPayout: 400, merchantDeliveryFee: 400 };

describe('computeCharges (proposal sections 6 and 11)', () => {
  it('takes 8% commission from item sales only', () => {
    const c = computeCharges({ ...rules, subtotal: 5000, fulfilment: Fulfilment.PICKUP });
    expect(c.commission).toBe(400);
    expect(c.deliveryFee).toBe(0);
    expect(c.total).toBe(5000);
  });

  it('gives ORBIT a NGN 300 contribution on a courier delivery', () => {
    const c = computeCharges({ ...rules, subtotal: 5000, fulfilment: Fulfilment.ORBIT_COURIER });
    expect(c.deliveryFee).toBe(700);
    expect(c.courierPayout).toBe(400);
    expect(c.platformDeliveryContribution).toBe(300);
    expect(c.total).toBe(5700);
  });

  it('charges the merchant’s own fee for merchant delivery and takes no delivery margin', () => {
    const c = computeCharges({ ...rules, subtotal: 5000, fulfilment: Fulfilment.MERCHANT_DELIVERY });
    expect(c.deliveryFee).toBe(400);
    expect(c.platformDeliveryContribution).toBe(0);
    expect(c.courierPayout).toBe(0);
  });

  it('rounds commission to whole naira', () => {
    expect(computeCharges({ ...rules, subtotal: 1234, fulfilment: Fulfilment.PICKUP }).commission).toBe(99); // 98.72
    expect(computeCharges({ ...rules, subtotal: 5, fulfilment: Fulfilment.PICKUP }).commission).toBe(0);
  });

  it('matches the proposal’s illustrative monthly figures', () => {
    // 600 orders x NGN 5,000 at 8% = NGN 240,000; 350 deliveries x NGN 300 = NGN 105,000.
    const order = computeCharges({ ...rules, subtotal: 5000, fulfilment: Fulfilment.ORBIT_COURIER });
    expect(order.commission * 600).toBe(240_000);
    expect(order.platformDeliveryContribution * 350).toBe(105_000);
  });
});

describe('delivery PIN', () => {
  const secret = 'unit-test-secret-unit-test-secret-12';
  it('is four digits and stable for an order', () => {
    const pin = derivePin('order-1', secret);
    expect(pin).toMatch(/^\d{4}$/);
    expect(derivePin('order-1', secret)).toBe(pin);
  });
  it('differs between orders and between secrets', () => {
    const pins = new Set(Array.from({ length: 50 }, (_, i) => derivePin(`order-${i}`, secret)));
    expect(pins.size).toBeGreaterThan(40);
    expect(derivePin('order-1', secret)).not.toBe(derivePin('order-1', 'another-secret-another-secret-1234'));
  });
  it('verifies in constant time and rejects wrong or odd-length input', () => {
    expect(pinMatches('1234', '1234')).toBe(true);
    expect(pinMatches('1234', '1235')).toBe(false);
    expect(pinMatches('1234', '123')).toBe(false);
  });
});

describe('webhook signature', () => {
  const body = Buffer.from('{"event":"charge.success"}');
  const good = createHmac('sha256', 's3cret').update(body).digest('hex');
  it('accepts a correct signature', () => expect(signatureMatches(body, good, 's3cret')).toBe(true));
  it('rejects tampered bodies, wrong secrets and missing signatures', () => {
    expect(signatureMatches(Buffer.from('{"event":"charge.failed"}'), good, 's3cret')).toBe(false);
    expect(signatureMatches(body, good, 'other')).toBe(false);
    expect(signatureMatches(body, undefined, 's3cret')).toBe(false);
  });
});

describe('prohibited goods policy', () => {
  it('blocks restricted items by whole word', () => {
    expect(findProhibitedTerm('Cold beer')).toBe('beer');
    expect(findProhibitedTerm('Fresh Tobacco leaf')).toBe('tobacco');
    expect(findProhibitedTerm('Tramadol 50mg')).toBe('tramadol');
  });
  it('allows ordinary goods, including words that merely contain a restricted term', () => {
    expect(findProhibitedTerm('Ginger drink')).toBeNull();
    expect(findProhibitedTerm('Jollof rice', 'with chicken')).toBeNull();
    expect(findProhibitedTerm('Sweater')).toBeNull();
  });
});
