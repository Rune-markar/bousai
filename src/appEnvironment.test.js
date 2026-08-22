import { describe, expect, it } from 'vitest';
import { resolveAppEnvironment } from './appEnvironment.js';

describe('app environment separation', () => {
  it('keeps the existing storage key for local data', () => {
    expect(resolveAppEnvironment('local')).toMatchObject({
      id: 'local',
      storageKey: 'sonae-note-state-v1',
      appApiEnabled: true,
    });
  });

  it('uses a separate storage and recovery namespace for demo data', () => {
    const local = resolveAppEnvironment('local');
    const demo = resolveAppEnvironment('demo');

    expect(demo.storageKey).not.toBe(local.storageKey);
    expect(demo.recoveryKeyPrefix).toBe('sonae-note-demo-state-v1-recovery');
    expect(demo.appApiEnabled).toBe(false);
  });

  it('rejects an unknown environment instead of silently using local data', () => {
    expect(() => resolveAppEnvironment('production')).toThrow('Unsupported app environment');
  });
});
