/**
 * One-time migration: copy localStorage keys from metabot: prefix to panmira: prefix.
 * Runs once on app load, then sets a sentinel to prevent re-execution.
 */

const OLD_PREFIX = 'metabot:';
const NEW_PREFIX = 'panmira:';
const MIGRATION_KEY = 'panmira:storage-migrated';

const KEYS_TO_MIGRATE = [
  'token',
  'user',
  'refresh',
  'sessions',
  'theme',
  'fontsize',
  'teamViewMode',
  'defaultEngine',
  'defaultModel',
  'defaultWorkDir',
  'aiProviders',
];

export function migrateLocalStorage(): void {
  if (localStorage.getItem(MIGRATION_KEY)) return;

  for (const key of KEYS_TO_MIGRATE) {
    const oldKey = `${OLD_PREFIX}${key}`;
    const newKey = `${NEW_PREFIX}${key}`;
    const value = localStorage.getItem(oldKey);
    if (value !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, value);
      localStorage.removeItem(oldKey);
    }
  }

  localStorage.setItem(MIGRATION_KEY, '1');
}
