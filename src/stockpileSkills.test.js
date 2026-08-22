import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { buildStockpileSkillTree, claimStockpileSkill, STOCKPILE_SKILL_STATUS } from './stockpileSkills.js';

const TODAY = new Date('2026-08-20T12:00:00Z');

const inventoryForDays = ({ water = 0, food = 0, toilet = 0, foodExpiry = '2030-01-01' } = {}) => [
  { id: 'water', name: '飲料水', category: 'water', quantity: water, volumeMl: 3000, expiry: '2030-01-01' },
  { id: 'food', name: '保存食', category: 'food', quantity: food, foodWeightG: 450, expiry: foodExpiry },
  { id: 'toilet', name: '携帯トイレ', category: 'hygiene', quantity: toilet * 5, expiry: '' },
  { id: 'light', name: 'LEDライト', category: 'light', quantity: 1, expiry: '' },
];

const readySafetyState = (inventory, claims = []) => ({
  household: 1,
  inventory,
  contact: { shelter: '市立小学校', phone: '090-0000-0000', note: '171を使う' },
  preparedness: {
    completed: ['furniture', 'hazard-map', 'medicine'],
    loadouts: {},
    stockpileSkillClaims: claims,
  },
});

const incompleteSafetyState = (inventory, claims = []) => ({
  household: 1,
  inventory,
  contact: { shelter: '', phone: '', note: '' },
  preparedness: {
    completed: [],
    loadouts: {},
    stockpileSkillClaims: claims,
  },
});

describe('stockpile skill tree', () => {
  it('食料3日分は水とトイレが未達でもclaimableになり、launcher対象になる', () => {
    const model = buildStockpileSkillTree(incompleteSafetyState(inventoryForDays({ food: 3 })), { today: TODAY });

    expect(model.byId['safety-foundation'].status).toBe(STOCKPILE_SKILL_STATUS.LOCKED);
    expect(model.byId['food-1'].status).toBe(STOCKPILE_SKILL_STATUS.CLAIMABLE);
    expect(model.byId['food-3']).toMatchObject({
      status: STOCKPILE_SKILL_STATUS.CLAIMABLE,
      conditionMet: true,
      currentlySatisfied: true,
      claimEffect: 'launcher',
    });
    expect(model.byId['water-1'].status).toBe(STOCKPILE_SKILL_STATUS.LOCKED);
    expect(model.byId['toilet-1'].status).toBe(STOCKPILE_SKILL_STATUS.LOCKED);
    expect(model.byId['home-1'].status).toBe(STOCKPILE_SKILL_STATUS.LOCKED);
    expect(model.byId['home-3'].status).toBe(STOCKPILE_SKILL_STATUS.LOCKED);
  });

  it('子をclaimすると条件を満たす未claim祖先も同時に永続化する', () => {
    const state = incompleteSafetyState(inventoryForDays({ food: 3 }));
    const next = claimStockpileSkill(state, 'food-3', { now: TODAY });

    expect(next).not.toBe(state);
    expect(state.preparedness.stockpileSkillClaims).toEqual([]);
    expect(next.preparedness.stockpileSkillClaims).toEqual(['food-1', 'food-3']);
    expect(next.preparedness.updatedAt).toBe('2026-08-20T12:00:00.000Z');
    expect(buildStockpileSkillTree(next, { today: TODAY }).byId['food-3'].status).toBe(STOCKPILE_SKILL_STATUS.CLAIMED);
  });

  it('home-3とhome-7は水・食料・トイレの全条件を満たす時だけclaimableになる', () => {
    const allSeven = readySafetyState(inventoryForDays({ water: 7, food: 7, toilet: 7 }));
    const model = buildStockpileSkillTree(allSeven, { today: TODAY });

    expect(model.byId['home-3'].status).toBe(STOCKPILE_SKILL_STATUS.CLAIMABLE);
    expect(model.byId['home-7'].status).toBe(STOCKPILE_SKILL_STATUS.CLAIMABLE);

    const claimed = claimStockpileSkill(allSeven, 'home-7', { now: TODAY });
    expect(claimed.preparedness.stockpileSkillClaims).toEqual(expect.arrayContaining([
      'water-1', 'food-1', 'toilet-1', 'home-1',
      'water-3', 'food-3', 'toilet-3', 'home-3',
      'water-7', 'food-7', 'toilet-7', 'home-7',
    ]));
    expect(buildStockpileSkillTree(claimed, { today: TODAY }).byId['home-7'].status).toBe(STOCKPILE_SKILL_STATUS.CLAIMED);
  });

  it.each([
    [0.99, 'home-1', STOCKPILE_SKILL_STATUS.LOCKED],
    [1, 'home-1', STOCKPILE_SKILL_STATUS.CLAIMABLE],
    [2.99, 'home-3', STOCKPILE_SKILL_STATUS.LOCKED],
    [3, 'home-3', STOCKPILE_SKILL_STATUS.CLAIMABLE],
    [6.99, 'home-7', STOCKPILE_SKILL_STATUS.LOCKED],
    [7, 'home-7', STOCKPILE_SKILL_STATUS.CLAIMABLE],
    [29.99, 'home-30', STOCKPILE_SKILL_STATUS.LOCKED],
    [30, 'home-30', STOCKPILE_SKILL_STATUS.CLAIMABLE],
  ])('%s日分では%sを%sと判定する', (days, nodeId, status) => {
    const state = readySafetyState(inventoryForDays({ water: days, food: days, toilet: days }));

    expect(buildStockpileSkillTree(state, { today: TODAY }).byId[nodeId].status).toBe(status);
  });

  it('安全確認は量と並行する4項目とし、家族固有品と食の多様性を7日まで待たせない', () => {
    const state = incompleteSafetyState([
      ...inventoryForDays({ food: 3 }),
      { id: 'chocolate', name: 'チョコレート', category: 'comfort', quantity: 1, expiry: '2030-01-01' },
      { id: 'medicine', name: '常用薬', category: 'hygiene', quantity: 1, expiry: '2030-01-01' },
    ]);
    const model = buildStockpileSkillTree(state, { today: TODAY });

    expect(model.safety.gates).toHaveLength(4);
    expect(model.safety.gates.map((gate) => gate.key)).not.toContain('light');
    expect(model.byId['safety-foundation'].title).toBe('備蓄量と並行する安全確認');
    expect(model.byId['diversity-food']).toMatchObject({ status: STOCKPILE_SKILL_STATUS.CLAIMABLE, parentIds: ['food-3'] });
    expect(model.byId['diversity-personal']).toMatchObject({ status: STOCKPILE_SKILL_STATUS.CLAIMABLE, parentIds: [] });
    expect(model.byId['diversity-calm'].status).toBe(STOCKPILE_SKILL_STATUS.LOCKED);
  });

  it('claim後に最短資源が不足したら履歴を残してreviewへ落とす', () => {
    const ready = readySafetyState(inventoryForDays({ water: 3, food: 3, toilet: 3 }));
    const claimed = claimStockpileSkill(ready, 'home-3', { now: TODAY });
    const depleted = {
      ...claimed,
      inventory: claimed.inventory.map((item) => item.id === 'water' ? { ...item, quantity: 0 } : item),
    };
    const model = buildStockpileSkillTree(depleted, { today: TODAY });

    expect(model.byId['water-3']).toMatchObject({ status: STOCKPILE_SKILL_STATUS.REVIEW, claimed: true, currentlySatisfied: false });
    expect(model.byId['home-3']).toMatchObject({ status: STOCKPILE_SKILL_STATUS.REVIEW, claimed: true, currentlySatisfied: false });
    expect(model.byId['food-3']).toMatchObject({ status: STOCKPILE_SKILL_STATUS.CLAIMED, currentlySatisfied: true });
    expect(model.claimedIds).toContain('home-3');
    expect(model.reviewIds).toEqual(expect.arrayContaining(['water-1', 'home-1', 'water-3', 'home-3']));
  });

  it('期限切れ品は条件に数えず、claim済みノードをreviewへ戻す', () => {
    const state = readySafetyState(inventoryForDays({ food: 3, foodExpiry: '2026-08-20' }));
    const claimed = claimStockpileSkill(state, 'food-3', { now: TODAY });
    const afterExpiry = buildStockpileSkillTree(claimed, { today: new Date('2026-08-21T12:00:00Z') });

    expect(afterExpiry.summary.foodDays).toBe(0);
    expect(afterExpiry.byId['food-1'].status).toBe(STOCKPILE_SKILL_STATUS.REVIEW);
    expect(afterExpiry.byId['food-3']).toMatchObject({ status: STOCKPILE_SKILL_STATUS.REVIEW, conditionMet: false, claimed: true });
  });

  it('UTCより西でも日付文字列をローカル日付として扱い、前日期限を数えない', () => {
    const moduleUrl = new URL('./stockpileSkills.js', import.meta.url).href;
    const script = `
      import { buildStockpileSkillTree } from ${JSON.stringify(moduleUrl)};

      const state = {
        household: 1,
        inventory: [
          { id: 'expired', name: '前日期限の保存食', category: 'food', quantity: 3, foodWeightG: 450, expiry: '2026-08-19' },
          { id: 'today', name: '当日期限の保存食', category: 'food', quantity: 1, foodWeightG: 450, expiry: '2026-08-20' },
        ],
        contact: { shelter: '', phone: '', note: '' },
        preparedness: { completed: [], loadouts: {}, stockpileSkillClaims: [] },
      };
      const model = buildStockpileSkillTree(state, { today: '2026-08-20' });
      process.stdout.write(JSON.stringify({
        foodDays: model.summary.foodDays,
        oneDayStatus: model.byId['food-1'].status,
        threeDayStatus: model.byId['food-3'].status,
      }));
    `;
    const result = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
      encoding: 'utf8',
      env: { ...process.env, TZ: 'America/Los_Angeles' },
    }));

    expect(result).toEqual({
      foodDays: 1,
      oneDayStatus: STOCKPILE_SKILL_STATUS.CLAIMABLE,
      threeDayStatus: STOCKPILE_SKILL_STATUS.LOCKED,
    });
  });

  it('lockedまたは未知のノードはclaimせず同じstateを返す', () => {
    const state = readySafetyState(inventoryForDays());

    expect(claimStockpileSkill(state, 'home-7', { now: TODAY })).toBe(state);
    expect(claimStockpileSkill(state, 'unknown', { now: TODAY })).toBe(state);
  });
});
