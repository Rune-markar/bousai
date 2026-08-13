import { describe, expect, it } from 'vitest';
import { buildCharacterAdvice, CHARACTERS, getCharacter, respondToCharacter } from './characters.js';

describe('character guidance', () => {
  it('assigns a distinct portrait and accessible description to every navigator', () => {
    expect(CHARACTERS).toHaveLength(5);
    expect(new Set(CHARACTERS.map((character) => character.image)).size).toBe(5);
    expect(CHARACTERS.every((character) => character.image.endsWith('.webp') && character.imageAlt.includes(character.name))).toBe(true);
  });

  it('uses the selected character voice for the most urgent stock action', () => {
    const advice = buildCharacterAdvice({ selectedCharacter: 'riko' }, { rows: [{ id: 'water', name: '水', unit: '本', shortage: 3, priority: 'high' }] });
    expect(advice.text).toContain('不足3本');
    expect(advice.page).toBe('inventory');
  });

  it('records a dialogue choice and affinity without exceeding 100', () => {
    const result = respondToCharacter({ selectedCharacter: 'akane', characterAffinity: { akane: 99 }, dialogueLog: [] }, 'done');
    expect(result.state.characterAffinity.akane).toBe(100);
    expect(result.state.dialogueLog).toHaveLength(1);
    expect(result.reply).toContain('勢い');
  });

  it('falls back to Hikari for unknown ids', () => expect(getCharacter('unknown').id).toBe('hikari'));
});
