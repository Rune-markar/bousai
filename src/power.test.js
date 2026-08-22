import { describe, expect, it } from 'vitest';
import { calculatePowerSystem, createDefaultPowerPlan, normalizePowerPlan } from './power.js';

describe('power ecosystem sizing', () => {
  it('sizes load, storage and solar generation as one system', () => {
    const result = calculatePowerSystem(createDefaultPowerPlan());
    expect(result.dailyLoadWh).toBe(384);
    expect(result.conversionLossWh).toBe(52);
    expect(result.requiredBatteryWh).toBe(4250);
    expect(result.requiredSolarW).toBe(200);
    expect(result.runningLoadW).toBe(70);
    expect(result.recommendedContinuousOutputW).toBe(100);
    expect(result.outputSizingComplete).toBe(false);
    expect(result.unconfirmedSurgeDevices.map((row) => row.id)).toEqual(['fan']);
    expect(result.surgeLoadW).toBeNull();
    expect(result.recommendedOutputW).toBeNull();
    expect(result.totalEstimateYen).toBeGreaterThan(200000);
  });

  it('uses measured wattage in detailed mode and keeps expected wattage as fallback', () => {
    const plan = createDefaultPowerPlan();
    plan.mode = 'detail';
    plan.devices.phone.actualWatts = 20;
    plan.devices.fan.actualWatts = 0;
    const result = calculatePowerSystem(plan);
    expect(result.rows.find((row) => row.id === 'phone').runningWatts).toBe(20);
    expect(result.rows.find((row) => row.id === 'fan').runningWatts).toBe(25);
  });

  it('normalizes unsafe or incomplete persisted values', () => {
    const plan = normalizePowerPlan({ mode: 'unknown', autonomyDays: 99, sunHours: 0, devices: { phone: { quantity: -4, expectedWatts: 0, surgeWatts: 20000, hours: 50 } } });
    expect(plan.mode).toBe('simple');
    expect(plan.autonomyDays).toBe(7);
    expect(plan.sunHours).toBe(1);
    expect(plan.devices.phone.quantity).toBe(0);
    expect(plan.devices.phone.expectedWatts).toBe(1);
    expect(plan.devices.phone.surgeWatts).toBe(10000);
    expect(plan.devices.fridge.surgeWatts).toBe(0);
    expect(plan.devices.phone.hours).toBe(24);
  });

  it('does not claim output compatibility while a selected motor load has unknown startup watts', () => {
    const plan = createDefaultPowerPlan();
    for (const device of Object.values(plan.devices)) device.quantity = 0;
    plan.devices.fridge.quantity = 1;

    const result = calculatePowerSystem(plan);

    expect(result.dailyLoadWh).toBe(720);
    expect(result.runningLoadW).toBe(60);
    expect(result.unconfirmedSurgeDevices.map((row) => row.id)).toEqual(['fridge']);
    expect(result.outputSizingComplete).toBe(false);
    expect(result.surgeLoadW).toBeNull();
    expect(result.recommendedContinuousOutputW).toBe(100);
    expect(result.recommendedSurgeOutputW).toBeNull();
    expect(result.recommendedOutputW).toBeNull();
  });

  it('separates confirmed startup watts from running watts when sizing output', () => {
    const plan = createDefaultPowerPlan();
    for (const device of Object.values(plan.devices)) device.quantity = 0;
    plan.mode = 'detail';
    plan.devices.fridge.quantity = 1;
    plan.devices.fridge.actualWatts = 60;
    plan.devices.fridge.surgeWatts = 450;

    const result = calculatePowerSystem(plan);

    expect(result.rows.find((row) => row.id === 'fridge')).toMatchObject({
      runningWatts: 60,
      surgeWatts: 450,
      surgeConfirmed: true,
    });
    expect(result.runningLoadW).toBe(60);
    expect(result.surgeLoadW).toBe(450);
    expect(result.recommendedContinuousOutputW).toBe(100);
    expect(result.recommendedSurgeOutputW).toBe(600);
    expect(result.recommendedOutputW).toBe(600);
    expect(result.outputSizingComplete).toBe(true);
  });

  it('keeps output sizing unresolved when entered startup watts are below running watts', () => {
    const plan = createDefaultPowerPlan();
    for (const device of Object.values(plan.devices)) device.quantity = 0;
    plan.devices.fridge.quantity = 1;
    plan.devices.fridge.surgeWatts = 50;

    const result = calculatePowerSystem(plan);

    expect(result.rows.find((row) => row.id === 'fridge').surgeConfirmed).toBe(false);
    expect(result.recommendedOutputW).toBeNull();
  });
});
