import { describe, expect, it } from 'vitest';
import { clock, inkOn, minutesUntil, monogram, naira, plural, weekday, when } from './format';
import { stopIndex, stopsFor } from './status';

describe('formatting', () => {
  it('formats naira with separators and handles missing values', () => {
    expect(naira(7100)).toBe('₦7,100');
    expect(naira(0)).toBe('₦0');
    expect(naira(1234567)).toBe('₦1,234,567');
    expect(naira(null)).toBe('–');
  });

  it('converts UTC to Lagos time (UTC+1)', () => {
    expect(clock('2026-11-06T13:05:00.000Z')).toBe('2:05 pm');
    expect(clock('2026-11-06T23:30:00.000Z')).toBe('12:30 am'); // next day in Lagos
    expect(clock('2026-11-06T11:00:00.000Z')).toBe('12:00 pm');
  });

  it('describes days relative to now in Lagos time', () => {
    const now = new Date('2026-11-06T12:00:00.000Z');
    expect(when('2026-11-06T08:00:00.000Z', now)).toBe('Today, 9:00 am');
    expect(when('2026-11-05T15:00:00.000Z', now)).toBe('Yesterday, 4:00 pm');
    expect(when('2026-11-01T15:00:00.000Z', now)).toBe('1 Nov, 4:00 pm');
  });

  it('counts minutes until a time', () => {
    const now = Date.parse('2026-11-06T12:00:00.000Z');
    expect(minutesUntil('2026-11-06T12:20:00.000Z', now)).toBe(20);
    expect(minutesUntil('2026-11-06T11:00:00.000Z', now)).toBe(0);
    expect(minutesUntil(null, now)).toBeNull();
  });

  it('pluralises, names weekdays and builds monograms', () => {
    expect(plural(1, 'item')).toBe('1 item');
    expect(plural(3, 'item')).toBe('3 items');
    expect(weekday('2026-11-06')).toBe('Fri');
    expect(monogram('Mama Nkechi’s Kitchen')).toBe('MN');
    expect(monogram('Gate 2 Suya Spot')).toBe('G2');
    expect(monogram('Kano Provisions')).toBe('KP');
  });

  it('picks readable text colour for any shop sign colour', () => {
    expect(inkOn('#F2B705')).toBe('#161a52'); // yellow sign: dark text
    expect(inkOn('#B4232A')).toBe('#ffffff'); // red sign: white text
    expect(inkOn('#1F4FBF')).toBe('#ffffff');
    expect(inkOn('not-a-colour')).toBe('#ffffff');
  });
});

describe('order stops', () => {
  it('pickup has no on-the-way stop', () => {
    expect(stopsFor('PICKUP').map((s) => s.key)).toEqual(['PLACED', 'CONFIRMED', 'READY', 'DELIVERED']);
    expect(stopsFor('ORBIT_COURIER').map((s) => s.key)).toEqual(['PLACED', 'CONFIRMED', 'READY', 'ON_THE_WAY', 'DELIVERED']);
  });
  it('locates the current stop', () => {
    expect(stopIndex({ status: 'READY', fulfilment: 'PICKUP' })).toBe(2);
    expect(stopIndex({ status: 'ON_THE_WAY', fulfilment: 'MERCHANT_DELIVERY' })).toBe(3);
    expect(stopIndex({ status: 'CANCELLED', fulfilment: 'PICKUP' })).toBe(-1);
  });
});
