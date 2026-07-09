import { FederationAdminController } from '../federation-admin.controller';
import { FederationAdminService } from '../federation-admin.service';
import type { UpsertFederationDto } from '../dto/upsert-federation.dto';

/**
 * FederationAdminController is a thin superadmin-guarded delegate over
 * FederationAdminService (the guard is covered by superadmin.guard.spec).
 * These assert each route forwards to the right service method.
 */
describe('FederationAdminController', () => {
  let service: jest.Mocked<FederationAdminService>;
  let controller: FederationAdminController;

  beforeEach(() => {
    service = {
      list: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({ slug: 'google' }),
      setEnabled: jest.fn().mockResolvedValue({ slug: 'google', enabled: true }),
      test: jest.fn().mockResolvedValue({ ok: true }),
    } as unknown as jest.Mocked<FederationAdminService>;
    controller = new FederationAdminController(service);
  });

  it('list delegates', async () => {
    await controller.list();
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it('upsert forwards slug + dto', async () => {
    const dto = { clientId: 'abc', clientSecret: 'shh' } as UpsertFederationDto;
    await controller.upsert('google', dto);
    expect(service.upsert).toHaveBeenCalledWith('google', dto);
  });

  it('enable sets enabled=true', async () => {
    await controller.enable('github');
    expect(service.setEnabled).toHaveBeenCalledWith('github', true);
  });

  it('disable sets enabled=false', async () => {
    await controller.disable('github');
    expect(service.setEnabled).toHaveBeenCalledWith('github', false);
  });

  it('test forwards the slug', async () => {
    await controller.test('oidc');
    expect(service.test).toHaveBeenCalledWith('oidc');
  });
});
