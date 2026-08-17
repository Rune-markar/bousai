import { describe, expect, it } from 'vitest';
import { DISASTER_PREPAREDNESS, disasterCompletion, toggleDisasterTask } from './disasterPreparedness.js';

describe('災害ごとの個別対策', () => {
  it('地震の家具固定を含む', () => {
    const earthquake = DISASTER_PREPAREDNESS.find((item) => item.id === 'earthquake');
    expect(earthquake.tasks).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'furniture-brace', title: expect.stringContaining('突っ張り棒') })]));
  });

  it('災害ごとにチェック状態と達成率を計算する', () => {
    const earthquake = DISASTER_PREPAREDNESS.find((item) => item.id === 'earthquake');
    const checks = toggleDisasterTask({}, 'earthquake', 'furniture-brace');
    expect(disasterCompletion(checks, earthquake)).toMatchObject({ done: 1, total: 5, percent: 20 });
    expect(toggleDisasterTask(checks, 'earthquake', 'furniture-brace').earthquake).toEqual([]);
  });
});
