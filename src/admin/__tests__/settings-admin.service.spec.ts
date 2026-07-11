import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SettingsAdminService } from '../settings-admin.service';
import { SettingsService } from '../../common/settings/settings.service';
import { AppSettingsStore } from '../../common/settings/app-settings.store';
import { OAuthAuditService } from '../../audit/oauth-audit.service';
import { fakeSettings } from '../../common/settings/settings.test-fixture';

function setup(env: Record<string, string> = {}) {
  const store = {
    set: jest.fn().mockResolvedValue(undefined),
    unset: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new SettingsAdminService(
    fakeSettings(env) as SettingsService,
    store as unknown as AppSettingsStore,
    audit as unknown as OAuthAuditService,
  );
  return { svc, store, audit };
}

describe('SettingsAdminService', () => {
  it('lists the registry with source + never leaks secret values', () => {
    const { svc } = setup({ MTLS_TRUSTED_CA_CERT: 'SECRET-PEM', RAR_ENABLED: 'true' });
    const list = svc.list();
    const ca = list.find((s) => s.key === 'MTLS_TRUSTED_CA_CERT')!;
    expect(ca.secret).toBe(true);
    expect(ca.value).toBeNull();
    expect(ca.isSet).toBe(true);
    const rar = list.find((s) => s.key === 'RAR_ENABLED')!;
    expect(rar.value).toBe('true');
    expect(rar.source).toBe('env');
  });

  it('sets a valid override and audit-logs it', async () => {
    const { svc, store, audit } = setup();
    await svc.set('RAR_ENABLED', 'true', 'did:key:admin');
    expect(store.set).toHaveBeenCalledWith('RAR_ENABLED', 'true');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'admin.settings.updated', sub: 'did:key:admin' }),
    );
  });

  it('rejects an invalid value', async () => {
    const { svc, store } = setup();
    await expect(svc.set('RAR_ENABLED', 'maybe', null)).rejects.toBeInstanceOf(BadRequestException);
    expect(store.set).not.toHaveBeenCalled();
  });

  it('rejects an unknown (non-registry) key', async () => {
    const { svc } = setup();
    await expect(svc.set('JWT_PRIVATE_KEY', 'x', null)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resets an override back to env + audit-logs it', async () => {
    const { svc, store, audit } = setup();
    await svc.reset('MTLS_ENABLED', 'did:key:admin');
    expect(store.unset).toHaveBeenCalledWith('MTLS_ENABLED');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'admin.settings.reset' }),
    );
  });
});
