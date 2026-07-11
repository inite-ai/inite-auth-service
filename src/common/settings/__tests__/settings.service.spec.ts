import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings.service';
import { AppSettingsStore } from '../app-settings.store';
import { validateSettingValue, settingDef } from '../settings.registry';

function make(db: Record<string, string>, env: Record<string, string>): SettingsService {
  const store = { get: (k: string) => db[k] } as unknown as AppSettingsStore;
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  return new SettingsService(store, config);
}

describe('SettingsService — DB → env → default resolution', () => {
  it('prefers a DB override over env', () => {
    const s = make({ RAR_ENABLED: 'true' }, { RAR_ENABLED: 'false' });
    expect(s.flag('RAR_ENABLED')).toBe(true);
    expect(s.source('RAR_ENABLED')).toBe('db');
  });

  it('falls back to env when no DB override', () => {
    const s = make({}, { RAR_ENABLED: 'true' });
    expect(s.flag('RAR_ENABLED')).toBe(true);
    expect(s.source('RAR_ENABLED')).toBe('env');
  });

  it('falls back to the caller default when neither is set', () => {
    const s = make({}, {});
    expect(s.flag('RAR_ENABLED')).toBe(false);
    expect(s.value('JWT_ACCESS_TOKEN_EXPIRY', '10m')).toBe('10m');
    expect(s.source('JWT_ACCESS_TOKEN_EXPIRY')).toBe('default');
  });

  it('value() returns the raw string when present', () => {
    const s = make({ JWT_ACCESS_TOKEN_EXPIRY: '30m' }, {});
    expect(s.value('JWT_ACCESS_TOKEN_EXPIRY', '10m')).toBe('30m');
  });
});

describe('settings registry validation', () => {
  it('validates flags', () => {
    const def = settingDef('RAR_ENABLED')!;
    expect(validateSettingValue(def, 'true')).toBeNull();
    expect(validateSettingValue(def, 'yes')).toMatch(/true.*false/);
  });

  it('validates durations', () => {
    const def = settingDef('JWT_ACCESS_TOKEN_EXPIRY')!;
    expect(validateSettingValue(def, '10m')).toBeNull();
    expect(validateSettingValue(def, '3600s')).toBeNull();
    expect(validateSettingValue(def, 'soon')).toMatch(/duration/);
  });

  it('validates csv', () => {
    const def = settingDef('AUTHORIZATION_DETAILS_TYPES')!;
    expect(validateSettingValue(def, 'a,b')).toBeNull();
    expect(validateSettingValue(def, ' , ')).toMatch(/comma/);
  });

  it('has no entry for a secret key like JWT_PRIVATE_KEY', () => {
    expect(settingDef('JWT_PRIVATE_KEY')).toBeUndefined();
  });
});
