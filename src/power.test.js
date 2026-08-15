import { describe, expect, it } from 'vitest';
import { calculatePowerSystem, createDefaultPowerPlan, normalizePowerPlan } from './power.js';

describe('power ecosystem sizing', () => {
  it('sizes load, storage and solar generation as one system', () => {
    const result = calculatePowerSystem(createDefaultPowerPlan());
    expect(result.dailyLoadWh).toBe(384);
    expect(result.conversionLossWh).toBe(52);
    expect(result.requiredBatteryWh).toBe(1850);
    expect(result.requiredSolarW).toBe(200);
    expect(result.recommendedOutputW).toBe(100);
    expect(result.totalEstimateYen).toBeGreaterThan(200000);
  });

  it('uses measured wattage in detailed mode and keeps expected wattage as fallback', () => {
    const plan = createDefaultPowerPlan();
    plan.mode = 'detail';
    plan.devices.phone.actualWatts = 20;
    plan.devices.fan.actualWatts = 0;
    const result = calculatePowerSystem(plan);
    expect(result.rows.find((row) => row.id === 'phone').watts).toBe(20);
    expect(result.rows.find((row) => row.id === 'fan').watts).toBe(25);
  });

  it('normalizes unsafe or incomplete persisted values', () => {
    const plan = normalizePowerPlan({ mode: 'unknown', autonomyDays: 99, sunHours: 0, devices: { phone: { quantity: -4, expectedWatts: 0, hours: 50 } } });
    expect(plan.mode).toBe('simple');
    expect(plan.autonomyDays).toBe(7);
    expect(plan.sunHours).toBe(1);
    expect(plan.devices.phone.quantity).toBe(0);
    expect(plan.devices.phone.expectedWatts).toBe(1);
    expect(plan.devices.phone.hours).toBe(24);
  });
});
