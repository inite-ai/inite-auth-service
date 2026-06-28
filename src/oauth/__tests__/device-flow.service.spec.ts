import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DeviceFlowService } from '../device-flow.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('DeviceFlowService', () => {
  let svc: DeviceFlowService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      deviceAuthorization: {
        findUnique: jest.fn(),
        create: jest.fn().mockImplementation(async ({ data }: any) => data),
        update: jest.fn().mockImplementation(async ({ data, where }: any) => ({
          ...data,
          id: where.id,
        })),
        delete: jest.fn(),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceFlowService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    svc = module.get(DeviceFlowService);
  });

  describe('issue()', () => {
    it('mints a device_code, an 8-char user_code with dash separator, and the verification URIs', async () => {
      prisma.deviceAuthorization.findUnique.mockResolvedValue(null); // no collision

      const out = await svc.issue({
        client: { clientId: 'tv-app' } as any,
        scope: 'openid profile',
        verificationUri: 'https://auth.inite.ai/v1/oauth/device',
      });
      expect(out.user_code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);
      expect(out.device_code.length).toBeGreaterThan(40);
      expect(out.verification_uri).toBe(
        'https://auth.inite.ai/v1/oauth/device',
      );
      expect(out.verification_uri_complete).toContain('?user_code=');
      expect(out.interval).toBe(5);
      expect(out.expires_in).toBe(600);
    });

    it('uses an ambiguity-free alphabet (no 0/O/1/I/etc.)', async () => {
      prisma.deviceAuthorization.findUnique.mockResolvedValue(null);
      const out = await svc.issue({
        client: { clientId: 'tv-app' } as any,
        verificationUri: 'https://auth.inite.ai/v1/oauth/device',
      });
      expect(out.user_code).not.toMatch(/[01OIAEU]/);
    });
  });

  describe('pollForApproval()', () => {
    const futureDate = () => new Date(Date.now() + 60_000);

    it('returns authorization_pending while status is pending', async () => {
      prisma.deviceAuthorization.findUnique.mockResolvedValue({
        id: 'd-1',
        deviceCodeHash: 'h',
        clientId: 'tv-app',
        status: 'pending',
        expiresAt: futureDate(),
        lastPolledAt: null,
        interval: 5,
      });

      const promise = svc.pollForApproval({
        deviceCode: 'whatever',
        clientId: 'tv-app',
      });
      await expect(promise).rejects.toMatchObject({
        response: { error: 'authorization_pending' },
      });
    });

    it('returns slow_down when polled inside the interval', async () => {
      const recent = new Date(Date.now() - 1000); // 1 s ago
      prisma.deviceAuthorization.findUnique.mockResolvedValue({
        id: 'd-1',
        deviceCodeHash: 'h',
        clientId: 'tv-app',
        status: 'pending',
        expiresAt: futureDate(),
        lastPolledAt: recent,
        interval: 5,
      });

      await expect(
        svc.pollForApproval({ deviceCode: 'w', clientId: 'tv-app' }),
      ).rejects.toMatchObject({ response: { error: 'slow_down' } });
      // Interval is bumped on slow_down
      expect(prisma.deviceAuthorization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ interval: 10 }),
        }),
      );
    });

    it('returns expired_token past expiresAt', async () => {
      prisma.deviceAuthorization.findUnique.mockResolvedValue({
        id: 'd-1',
        deviceCodeHash: 'h',
        clientId: 'tv-app',
        status: 'pending',
        expiresAt: new Date(Date.now() - 60_000),
        lastPolledAt: null,
        interval: 5,
      });
      await expect(
        svc.pollForApproval({ deviceCode: 'w', clientId: 'tv-app' }),
      ).rejects.toMatchObject({ response: { error: 'expired_token' } });
    });

    it('returns access_denied when user denied', async () => {
      prisma.deviceAuthorization.findUnique.mockResolvedValue({
        id: 'd-1',
        deviceCodeHash: 'h',
        clientId: 'tv-app',
        status: 'denied',
        expiresAt: futureDate(),
        lastPolledAt: null,
        interval: 5,
      });
      await expect(
        svc.pollForApproval({ deviceCode: 'w', clientId: 'tv-app' }),
      ).rejects.toMatchObject({ response: { error: 'access_denied' } });
    });

    it('returns the approved row + deletes it (single-use)', async () => {
      prisma.deviceAuthorization.findUnique.mockResolvedValue({
        id: 'd-1',
        deviceCodeHash: 'h',
        clientId: 'tv-app',
        status: 'approved',
        userId: 'user-1',
        expiresAt: futureDate(),
        lastPolledAt: new Date(Date.now() - 60_000), // 1 min ago, past interval
        interval: 5,
        scope: 'openid',
      });
      const row = await svc.pollForApproval({
        deviceCode: 'w',
        clientId: 'tv-app',
      });
      expect(row.userId).toBe('user-1');
      expect(prisma.deviceAuthorization.delete).toHaveBeenCalled();
    });

    it('rejects when clientId on the row does not match the polling client', async () => {
      prisma.deviceAuthorization.findUnique.mockResolvedValue({
        clientId: 'OTHER',
        status: 'pending',
        expiresAt: futureDate(),
      });
      await expect(
        svc.pollForApproval({ deviceCode: 'w', clientId: 'tv-app' }),
      ).rejects.toMatchObject({ response: { error: 'invalid_grant' } });
    });
  });

  describe('approve()', () => {
    it('flips a pending row to approved', async () => {
      prisma.deviceAuthorization.findUnique.mockResolvedValue({
        id: 'd-1',
        userCode: 'ABCD-EFGH',
        status: 'pending',
        expiresAt: new Date(Date.now() + 60_000),
      });
      const result = await svc.approve({
        userCode: 'abcd-efgh', // case-insensitive
        userId: 'u-1',
      });
      expect(result.status).toBe('approved');
      expect(prisma.deviceAuthorization.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'approved', userId: 'u-1' },
        }),
      );
    });

    it('throws for non-existent user_code', async () => {
      prisma.deviceAuthorization.findUnique.mockResolvedValue(null);
      await expect(
        svc.approve({ userCode: 'X', userId: 'u-1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
