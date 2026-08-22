const ENVIRONMENTS = Object.freeze({
  local: Object.freeze({
    id: 'local',
    label: 'ローカル',
    storageKey: 'sonae-note-state-v1',
    backupFilenamePrefix: 'sonae-note',
    appApiEnabled: true,
    description: 'この端末のローカル環境',
  }),
  demo: Object.freeze({
    id: 'demo',
    label: 'デモ',
    storageKey: 'sonae-note-demo-state-v1',
    backupFilenamePrefix: 'sonae-note-demo',
    appApiEnabled: false,
    description: '公開デモ専用の保存領域',
  }),
});

export function resolveAppEnvironment(value = 'local') {
  const id = String(value || 'local').trim().toLowerCase();
  const environment = ENVIRONMENTS[id];
  if (!environment) throw new Error(`Unsupported app environment: ${id}`);
  return Object.freeze({
    ...environment,
    isDemo: id === 'demo',
    recoveryKeyPrefix: `${environment.storageKey}-recovery`,
  });
}

export const APP_ENVIRONMENT = resolveAppEnvironment(import.meta.env?.VITE_APP_ENV || 'local');
