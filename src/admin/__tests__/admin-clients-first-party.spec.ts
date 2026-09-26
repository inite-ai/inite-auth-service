import { BadRequestException } from '@nestjs/common';
import { AdminClientsService } from '../admin-clients.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AdminClientsService first-party', () => {
  let prisma: { oAuthClient: { create: jest.Mock; update: jest.Mock } };
  let service: AdminClientsService;

  beforeEach(() => {
    const echo = ({ data }: { data: Record<string, unknown> }) => ({ id: 'c1', clientSecretHash: 'h', clientId: 'x', ...data });
    prisma = { oAuthClient: { create: jest.fn().mockImplementation(echo), update: jest.fn().mockImplementation(echo) } };
    service = new AdminClientsService(prisma as unknown as PrismaService);
  });

  it('registers an admin-created client as first-party by default', async () => {
    await service.createOAuthClient({ name: 'App', clientId: 'my-app', redirectUris: [] });
    expect(prisma.oAuthClient.create.mock.calls[0][0].data.firstParty).toBe(true);
  });

  it('registers it as third-party when unticked', async () => {
    await service.createOAuthClient({ name: 'Partner', clientId: 'partner', redirectUris: [], firstParty: false });
    expect(prisma.oAuthClient.create.mock.calls[0][0].data.firstParty).toBe(false);
  });

  it('toggles it at runtime and leaves it alone when not sent', async () => {
    await service.updateOAuthClient('my-app', { firstParty: false });
    expect(prisma.oAuthClient.update.mock.calls[0][0].data.firstParty).toBe(false);
    await service.updateOAuthClient('my-app', { name: 'Renamed' });
    expect(prisma.oAuthClient.update.mock.calls[1][0].data).not.toHaveProperty('firstParty');
  });

  it('refuses to make a self-registered dcr_ client first-party', async () => {
    await expect(service.updateOAuthClient('dcr_abc', { firstParty: true })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createOAuthClient({ name: 'X', clientId: 'dcr_x', redirectUris: [] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
