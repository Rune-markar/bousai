import { describe, expect, it } from 'vitest';
import { buildCharacterAdvice, CHARACTERS, getCharacter, respondToCharacter } from './characters.js';

describe('character guidance', () => {
  const safetyReadyState = (selectedCharacter = 'hikari') => ({
    selectedCharacter,
    contact: { shelter: '小学校', phone: '090-0000-0000', note: '公園で集合' },
    preparedness: {
      completed: ['furniture', 'hazard-map', 'medicine', 'food-fit', 'light-fire'],
      loadouts: { 'light-fire': ['shoes', 'light', 'gloves', 'whistle', 'extinguisher'] },
    },
  });
  const threeDaySummary = (rows = []) => ({ rows, waterDays: 3, foodDays: 3, toiletDays: 3 });

  it('assigns a distinct portrait and accessible description to every navigator', () => {
    expect(CHARACTERS).toHaveLength(5);
    expect(new Set(CHARACTERS.map((character) => character.image)).size).toBe(5);
    expect(CHARACTERS.every((character) => character.image.endsWith('.webp') && character.imageAlt.includes(character.name))).toBe(true);
  });

  it('uses the selected character voice for the most urgent stock action', () => {
    const advice = buildCharacterAdvice({ selectedCharacter: 'riko' }, { rows: [{ id: 'water', name: '水', category: 'water', waterPurpose: 'drinking-cooking', volumeMl: 500, unit: '本', shortage: 3, priority: 'high' }], waterDays: 0, foodDays: 3, toiletDays: 3 });
    expect(advice.text).toContain('不足3本');
    expect(advice.page).toBe('inventory');
  });

  it('never reports ready for an empty inventory and starts with drinking/cooking water', () => {
    const advice = buildCharacterAdvice({ selectedCharacter: 'hikari' }, { rows: [], waterDays: 0, foodDays: 0, toiletDays: 0 });
    expect(advice.kind).toBe('shortage');
    expect(advice.text).toContain('飲料・調理用水');
    expect(advice.text).toContain('3日分');
  });

  it('prioritizes three-day water, food, then portable-toilet coverage before expiry notices', () => {
    const expiringCoffee = { id: 'coffee', name: 'コーヒー', category: 'comfort', unit: '袋', shortage: 0, priority: 'ok', isExpiring: true };
    expect(buildCharacterAdvice(safetyReadyState(), { rows: [expiringCoffee], waterDays: 0, foodDays: 0, toiletDays: 0 }).text).toContain('飲料・調理用水');
    expect(buildCharacterAdvice(safetyReadyState(), { rows: [expiringCoffee], waterDays: 3, foodDays: 0, toiletDays: 0 }).text).toContain('食料');
    expect(buildCharacterAdvice(safetyReadyState(), { rows: [expiringCoffee], waterDays: 3, foodDays: 3, toiletDays: 0 }).text).toContain('携帯トイレ');
  });

  it('does not let an unrelated review item hide a critical water shortage', () => {
    const coffeeReview = { id: 'coffee', name: 'コーヒー', category: 'comfort', needsVerification: true, shortage: 1, unit: '袋' };
    const advice = buildCharacterAdvice(safetyReadyState(), { rows: [coffeeReview], waterDays: 0, foodDays: 3, toiletDays: 3 });

    expect(advice.kind).toBe('shortage');
    expect(advice.text).toContain('飲料・調理用水');
    expect(advice.text).not.toContain('コーヒー');
  });

  it('does not let a utility-water review item hide a drinking-water shortage', () => {
    const utilityReview = { id: 'utility', name: '生活用水', category: 'water', waterPurpose: 'utility', needsVerification: true, shortage: 1, unit: '箱' };
    const advice = buildCharacterAdvice(safetyReadyState(), { rows: [utilityReview], waterDays: 0, foodDays: 3, toiletDays: 3 });

    expect(advice.kind).toBe('shortage');
    expect(advice.text).toContain('飲料・調理用水');
  });

  it('asks to verify a potentially drinkable water row before recommending more', () => {
    const waterReview = { id: 'water', name: '用途未確認の水', category: 'water', waterPurpose: 'needs-review', needsVerification: true, shortage: 6, unit: '本' };
    const advice = buildCharacterAdvice(safetyReadyState(), { rows: [waterReview], waterDays: 0, foodDays: 3, toiletDays: 3 });

    expect(advice.kind).toBe('data-review');
    expect(advice.itemId).toBe('water');
    expect(advice.text).toContain('実物の期限・分類・用途を確認');
  });

  it.each([
    '非常用トイレ用手袋セット',
    '携帯トイレ用防臭袋セット',
    '災害用トイレ用目隠しポンチョセット',
    '簡易トイレ用ポリ袋セット',
  ])('does not recommend the toilet accessory %s as if it supplied disposal uses', (name) => {
    const accessory = { id: 'accessory', name, category: 'hygiene', shortage: 35, unit: '箱', priority: 'high' };
    const advice = buildCharacterAdvice(safetyReadyState(), { rows: [accessory], waterDays: 3, foodDays: 3, toiletDays: 0 });

    expect(advice.kind).toBe('shortage');
    expect(advice.text).toContain('携帯トイレ');
    expect(advice.text).toContain('3日分');
    expect(advice.text).not.toContain(name);
    expect(advice.text).not.toContain('35箱');
  });

  it('uses only measurable and verified water rows for concrete purchase advice', () => {
    const unmeasured = { id: 'water', name: '量が未登録の飲料水', category: 'water', waterPurpose: 'drinking-cooking', shortage: 6, unit: '本', volumeMl: 0, priority: 'high' };
    const advice = buildCharacterAdvice(safetyReadyState(), { rows: [unmeasured], waterDays: 0, foodDays: 3, toiletDays: 3 });

    expect(advice.text).toContain('飲料・調理用水');
    expect(advice.text).toContain('3日分');
    expect(advice.text).not.toContain('6本');
  });

  it('does not recommend more bags when the missing portable-toilet component is coagulant', () => {
    const bag = { id: 'bag', name: '携帯トイレ用袋', category: 'hygiene', shortage: 15, unit: '枚', priority: 'high' };
    const advice = buildCharacterAdvice(safetyReadyState(), { rows: [bag], waterDays: 3, foodDays: 3, toiletDays: 0 });

    expect(advice.text).toContain('携帯トイレ');
    expect(advice.text).toContain('3日分');
    expect(advice.text).not.toContain('15枚');
  });

  it('routes incomplete non-inventory safety gates before routine stock notices', () => {
    const advice = buildCharacterAdvice({ selectedCharacter: 'riko', preparedness: { completed: [] }, contact: {} }, threeDaySummary([{ id: 'coffee', name: 'コーヒー', category: 'comfort', shortage: 1, unit: '袋', isExpiring: true }]));
    expect(advice.kind).toBe('safety-check');
    expect(advice.text).toContain('住まいの安全');
    expect(advice.page).toBe('roadmap');
  });

  it('does not report ready when food quantity is sufficient but its usable composition is unverified', () => {
    const state = safetyReadyState();
    state.preparedness.completed = state.preparedness.completed.filter((id) => id !== 'food-fit');
    const advice = buildCharacterAdvice(state, threeDaySummary());

    expect(advice.kind).toBe('safety-check');
    expect(advice.text).toContain('食料');
    expect(advice.text).toContain('構成を実物確認');
    expect(advice.page).toBe('roadmap');
  });

  it('tells users to discard expired stock instead of consuming it', () => {
    const expired = { id: 'expired-food', name: '期限切れ缶詰', category: 'food', shortage: 1, unit: '缶', isExpired: true, isExpiring: true };
    const advice = buildCharacterAdvice(safetyReadyState('akane'), threeDaySummary([expired]));
    expect(advice.kind).toBe('expired');
    expect(advice.text).toContain('期限切れ');
    expect(advice.text).toContain('廃棄・交換');
    expect(advice.text).not.toContain('おいしく使');
  });

  it('prioritizes a nonessential shortage before a merely expiring item after safety gates pass', () => {
    const rows = [
      { id: 'coffee', name: 'コーヒー', category: 'comfort', shortage: 0, unit: '袋', isExpiring: true },
      { id: 'battery', name: '乾電池', category: 'light', shortage: 2, unit: '本' },
    ];
    const advice = buildCharacterAdvice(safetyReadyState('riko'), threeDaySummary(rows));
    expect(advice.kind).toBe('shortage');
    expect(advice.text).toContain('乾電池');
  });

  it('records a dialogue choice and affinity without exceeding 100', () => {
    const result = respondToCharacter({ selectedCharacter: 'akane', characterAffinity: { akane: 99 }, dialogueLog: [] }, 'done');
    expect(result.state.characterAffinity.akane).toBe(100);
    expect(result.state.dialogueLog).toHaveLength(1);
    expect(result.reply).toContain('勢い');
  });

  it('falls back to Hikari for unknown ids', () => expect(getCharacter('unknown').id).toBe('hikari'));
});
