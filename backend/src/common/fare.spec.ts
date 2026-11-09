import { VEHICLE_SPECS } from './catalog';
import { computeFare, promoDiscount, surgeMultiplier } from './fare';
import { MARKETS } from './markets';

const NG = MARKETS.NG;
const base = { market: NG, commissionBps: 1000, surge: 1 };

describe('computeFare', () => {
  it('prices a 10 km, 25 minute motorbike ride from the tariff, rounded up to the market step', () => {
    const f = computeFare({ ...base, tariff: VEHICLE_SPECS.MOTORCYCLE.tariff, distanceM: 10_000, durationS: 25 * 60 });
    // 200 + 70 x 10 + 5 x 25 = 1025, rounded up to the nearest 10 (NG)
    expect(f.fare).toBe(1030);
    expect(f.commission).toBe(103);
    expect(f.driverEarning + f.commission).toBe(f.fare);
  });

  it('never charges less than the minimum fare', () => {
    const f = computeFare({ ...base, tariff: VEHICLE_SPECS.CAR.tariff, distanceM: 300, durationS: 120 });
    expect(f.fare).toBe(VEHICLE_SPECS.CAR.tariff.minFare);
  });

  it('applies surge to the whole fare and reports how much it added', () => {
    const calm = computeFare({ ...base, tariff: VEHICLE_SPECS.CAR.tariff, distanceM: 8000, durationS: 1200 });
    const busy = computeFare({ ...base, tariff: VEHICLE_SPECS.CAR.tariff, distanceM: 8000, durationS: 1200, surge: 1.5 });
    expect(busy.fare).toBeGreaterThanOrEqual(Math.round(calm.fare * 1.5) - 10);
    expect(busy.surgeAmount).toBe(busy.fare - calm.fare);
    expect(calm.surgeAmount).toBe(0);
  });

  it('prices a long-haul trucking job sensibly (600 km, 10 hours)', () => {
    const f = computeFare({ ...base, tariff: VEHICLE_SPECS.LONG_HAUL.tariff, distanceM: 600_000, durationS: 10 * 3600 });
    expect(f.fare).toBe(50_000 + 1100 * 600 + 40 * 600); // base + per km + per minute
  });

  it('keeps driver earning plus commission equal to the fare at any size', () => {
    for (const km of [0.4, 3, 17.3, 250]) {
      const f = computeFare({ ...base, tariff: VEHICLE_SPECS.KEKE.tariff, distanceM: km * 1000, durationS: km * 150 });
      expect(f.driverEarning + f.commission).toBe(f.fare);
      expect(f.fare % NG.fareRounding).toBe(0);
    }
  });
});

describe('surgeMultiplier', () => {
  it.each([
    [0, 5, 1], [5, 5, 1], [3, 5, 1], // enough drivers
    [10, 5, 1.2], [20, 5, 1.5], [100, 5, 2], // grows with scarcity, capped
    [4, 0, 1], // nobody to attract: no surge
  ])('demand %i, supply %i -> %f', (d, s, expected) => {
    expect(surgeMultiplier(d, s, 2)).toBe(expected);
  });
});

describe('promoDiscount', () => {
  it('takes a percentage up to its cap, but never more than ORBIT’s own commission', () => {
    expect(promoDiscount({ type: 'PERCENT', value: 20, maxDiscount: 500 }, 2000, 200)).toBe(200);
    expect(promoDiscount({ type: 'PERCENT', value: 10, maxDiscount: null }, 1000, 100)).toBe(100);
    expect(promoDiscount({ type: 'PERCENT', value: 5, maxDiscount: null }, 1000, 100)).toBe(50);
  });
  it('handles flat discounts and never goes negative or above the fare', () => {
    expect(promoDiscount({ type: 'FLAT', value: 300, maxDiscount: null }, 1000, 500)).toBe(300);
    expect(promoDiscount({ type: 'FLAT', value: 300, maxDiscount: 100 }, 1000, 500)).toBe(100);
    expect(promoDiscount({ type: 'FLAT', value: 900, maxDiscount: null }, 400, 1000)).toBe(400);
  });
});
