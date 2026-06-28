import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { IdentityService } from '../identity.service';
import { IdentityAccountService } from '../identity-account.service';
import { IdentityEmailService } from '../identity-email.service';
import { DidService } from '../did.service';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

describe('IdentityService', () => {
  let accountService: IdentityAccountService;
  let emailService: IdentityEmailService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      wallet: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdentityService,
        IdentityAccountService,
        IdentityEmailService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DidService, useValue: { generateDid: jest.fn().mockResolvedValue({ did: 'did:key:test', publicKey: 'pk', privateKey: 'sk' }) } },
        {
          provide: EmailService,
          useValue: {
            sendEmailVerification: jest.fn(),
            sendEmailChangeVerification: jest.fn(),
            sendPasswordChanged: jest.fn().mockResolvedValue(true),
          },
        },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('https://auth.inite.ai') } },
      ],
    }).compile();

    accountService = module.get<IdentityAccountService>(IdentityAccountService);
    emailService = module.get<IdentityEmailService>(IdentityEmailService);
  });

  describe('changePassword', () => {
    it('should reject password shorter than 8 chars', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', passwordHash: null });
      await expect(accountService.changePassword('1', '', 'short')).rejects.toThrow('at least 8 characters');
    });

    it('should reject password without uppercase', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', passwordHash: null });
      await expect(accountService.changePassword('1', '', 'lowercase1')).rejects.toThrow('uppercase');
    });

    it('should reject password without number', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', passwordHash: null });
      await expect(accountService.changePassword('1', '', 'NoNumbers')).rejects.toThrow('number');
    });

    it('should accept valid password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', passwordHash: null });
      mockPrisma.user.update.mockResolvedValue({});
      await expect(accountService.changePassword('1', '', 'ValidPass1')).resolves.not.toThrow();
    });

    it('should verify current password if set', async () => {
      const hash = await bcrypt.hash('oldpass', 10);
      mockPrisma.user.findUnique.mockResolvedValue({ id: '1', passwordHash: hash });
      await expect(accountService.changePassword('1', 'wrongold', 'NewPass1')).rejects.toThrow('incorrect');
    });
  });

  describe('updateMetadata', () => {
    it('should strip isAdmin and roles from metadata update', async () => {
      const user = { id: '1', metadata: { existing: true }, wallets: [], passkeys: [] };
      mockPrisma.user.findUnique.mockResolvedValue(user);
      mockPrisma.user.update.mockImplementation(({ data }: any) =>
        Promise.resolve({ ...user, metadata: data.metadata }),
      );

      const result = await accountService.updateMetadata('1', {
        isAdmin: true,
        roles: ['admin'],
        customField: 'value',
      });

      expect((result.metadata as any).isAdmin).toBeUndefined();
      expect((result.metadata as any).roles).toBeUndefined();
      expect((result.metadata as any).customField).toBe('value');
      expect((result.metadata as any).existing).toBe(true);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email with valid token', async () => {
      const future = new Date();
      future.setHours(future.getHours() + 1);
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: '1',
        emailVerificationToken: 'valid-token',
        emailVerificationExpires: future,
      });
      mockPrisma.user.update.mockResolvedValue({});

      const result = await emailService.verifyEmail('valid-token');
      expect(result.success).toBe(true);
    });

    it('should reject expired verification token', async () => {
      const past = new Date();
      past.setHours(past.getHours() - 1);
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: '1',
        emailVerificationToken: 'expired',
        emailVerificationExpires: past,
      });

      await expect(emailService.verifyEmail('expired')).rejects.toThrow('expired');
    });
  });
});
