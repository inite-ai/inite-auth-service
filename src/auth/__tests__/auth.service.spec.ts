import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';
import { PasskeyService } from '../passkey.service';
import { MagicLinkService } from '../magic-link.service';
import { IdentityService } from '../../identity/identity.service';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: any;
  let jwtService: any;

  const mockUser = {
    id: 'user-1',
    did: 'did:key:z6Mk...',
    email: 'test@example.com',
    emailVerified: true,
    name: 'Test User',
    metadata: { roles: ['user'] },
  };

  beforeEach(async () => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      userKnownDevice: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('jwt-token'),
      verify: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IdentityService, useValue: { createIdentity: jest.fn(), getIdentityById: jest.fn() } },
        { provide: PasskeyService, useValue: {} },
        { provide: MagicLinkService, useValue: {} },
        { provide: EmailService, useValue: { sendWelcome: jest.fn(), sendNewDeviceLogin: jest.fn(), sendPasswordReset: jest.fn().mockResolvedValue(true) } },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('https://auth.inite.ai') } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('loginWithPassword', () => {
    it('should return user and token for valid credentials', async () => {
      const hash = await bcrypt.hash('password123', 10);
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });

      const result = await service.loginWithPassword('test@example.com', 'password123');
      expect(result.user.email).toBe('test@example.com');
      expect(result.accessToken).toBe('jwt-token');
    });

    it('should throw for invalid email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.loginWithPassword('wrong@example.com', 'pass')).rejects.toThrow('Invalid credentials');
    });

    it('should throw for wrong password', async () => {
      const hash = await bcrypt.hash('correct', 10);
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: hash });
      await expect(service.loginWithPassword('test@example.com', 'wrong')).rejects.toThrow('Invalid credentials');
    });

    it('should throw for user without password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser, passwordHash: null });
      await expect(service.loginWithPassword('test@example.com', 'pass')).rejects.toThrow('Invalid credentials');
    });
  });

  describe('generateTokenForUser', () => {
    it('should generate JWT with user claims', () => {
      service.generateTokenForUser(mockUser as any);
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: mockUser.did,
          userId: mockUser.id,
          email: mockUser.email,
        }),
        expect.objectContaining({ expiresIn: '1h' }),
      );
    });

    it('should not include metadata in token', () => {
      service.generateTokenForUser(mockUser as any);
      const payload = jwtService.sign.mock.calls[0][0];
      expect(payload.metadata).toBeUndefined();
    });
  });

  describe('verifyToken', () => {
    it('should return payload for valid token', async () => {
      jwtService.verify.mockReturnValue({ userId: 'user-1', sub: 'did:key:...' });
      const result = await service.verifyToken('valid-token');
      expect(result.userId).toBe('user-1');
    });

    it('should throw for invalid token', async () => {
      jwtService.verify.mockImplementation(() => { throw new Error('invalid'); });
      await expect(service.verifyToken('bad-token')).rejects.toThrow('Invalid token');
    });
  });

  describe('requestPasswordReset', () => {
    it('should not throw for non-existent email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(service.requestPasswordReset('nonexistent@example.com')).resolves.not.toThrow();
    });

    it('should hash the reset token before saving', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...mockUser });
      mockPrisma.user.update.mockResolvedValue({});

      await service.requestPasswordReset('test@example.com');

      const updateCall = mockPrisma.user.update.mock.calls[0][0];
      // Token should be a hex string (SHA-256 hash), not base64url
      expect(updateCall.data.passwordResetToken).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('resetPassword', () => {
    it('should throw for invalid token', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      await expect(service.resetPassword('bad-token', 'newpass')).rejects.toThrow('Invalid reset token');
    });

    it('should throw for expired token', async () => {
      const expired = new Date();
      expired.setHours(expired.getHours() - 2);
      mockPrisma.user.findFirst.mockResolvedValue({
        ...mockUser,
        passwordResetToken: 'hash',
        passwordResetExpires: expired,
      });
      await expect(service.resetPassword('token', 'newpass')).rejects.toThrow('expired');
    });
  });
});
