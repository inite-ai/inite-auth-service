import { SettingsService } from './settings.service';

/**
 * Build a SettingsService stub backed by a plain env map, for unit tests that
 * construct services directly (no Nest DI). Mirrors the DB→env→default
 * resolution: a present key resolves as 'env', absent as 'default'.
 */
export function fakeSettings(
  env: Record<string, string | undefined>,
): SettingsService {
  return {
    raw: (k: string) => env[k],
    flag: (k: string) => env[k] === 'true',
    value: (k: string, fallback = '') => env[k] ?? fallback,
    source: (k: string) => (env[k] !== undefined ? 'env' : 'default'),
  } as unknown as SettingsService;
}
