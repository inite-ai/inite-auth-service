import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { OAuthController } from '../oauth.controller';
import { OAuthService } from '../oauth.service';
import { AuthService } from '../../auth/auth.service';
import { OAuthAuditService } from '../../audit/oauth-audit.service';
import { MetricsService } from '../../common/metrics.service';

const mockMetrics = (): any => ({
  tokensIssued: { inc: jest.fn() },
  tokenFailures: { inc: jest.fn() },
  tokenLatency: { startTimer: () => () => undefined },
  authAttempts: { inc: jest.fn() },
  accountLockouts: { inc: jest.fn() },
  auditWriteFailures: { inc: jest.fn() },
});

/**
 * Audit-log write coverage for /oauth/token paths. Stubs the
 * services and asserts the controller emits the right audit event
 * on every success + failure branch. We don't hit Prisma — the
 * audit service itself is mocked.
 */
describe('OAuthController /oauth/token — audit log writes', () => {
  let controller: OAuthController;
  let oauth: any;
  let audit: jest.Mocked<Pick<OAuthAuditService, 'record'>>;

  const m2mClient = {
    clientId: 'smart-chat-brain',
    companyId: 'co_smar_chat',
    allowedGrants: ['client_credentials'],
    allowedScopes: ['brain:read', 'brain:write', 'brain:admin'],
    allowedAudiences: ['brain'],
    active: true,
  } as any;

  const userClient = {
    clientId: 'smart-chat',
    allowedGrants: ['authorization_code', 'refresh_token'],
    allowedScopes: ['openid', 'profile', 'email'],
    active: true,
  } as any;

  beforeEach(() => {
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    oauth = {
      validateClientWithSecret: jest.fn(),
      validateGrantType: jest.fn(),
      exchangeAuthorizationCode: jest.fn(),
      refreshAccessToken: jest.fn(),
      issueClientCredentialsToken: jest.fn(),
    };
    const authSvc = { verifyToken: jest.fn() } as unknown as AuthService;
    controller = new OAuthController(
      oauth as OAuthService,
      authSvc,
      audit as unknown as OAuthAuditService,
      mockMetrics() as unknown as MetricsService,
    );
  });

  const req: any = { headers: { 'user-agent': 'jest' }, ip: '10.0.0.1' };

  it('records token.issued.client_credentials on M2M success', async () => {
    oauth.validateClientWithSecret.mockResolvedValue(m2mClient);
    oauth.issueClientCredentialsToken.mockResolvedValue({
      accessToken: 'jwt',
      expiresIn: 300,
      scope: 'brain:read brain:write brain:admin',
      audience: 'brain',
    });

    await controller.token(
      'client_credentials',
      '', '', 'smart-chat-brain', 'secret',
      '', '', 'brain:read brain:write brain:admin', 'brain',
      req,
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'token.issued.client_credentials',
        clientId: 'smart-chat-brain',
        sub: 'co_smar_chat',
        scopes: ['brain:read', 'brain:write', 'brain:admin'],
        audience: 'brain',
        success: true,
      }),
    );
  });

  it('records token.failed.invalid_credentials when client unknown', async () => {
    oauth.validateClientWithSecret.mockRejectedValue(
      new UnauthorizedException('Invalid client'),
    );

    await expect(
      controller.token(
        'client_credentials',
        '', '', 'ghost-client', 'wrong',
        '', '', '', 'brain',
        req,
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'token.failed.invalid_credentials',
        clientId: 'ghost-client',
        success: false,
      }),
    );
  });

  it('records token.failed.unsupported_grant when grant not in allowedGrants', async () => {
    oauth.validateClientWithSecret.mockResolvedValue(userClient);
    oauth.validateGrantType.mockImplementation(() => {
      throw new BadRequestException('Grant type "client_credentials" is not allowed for this client');
    });

    await expect(
      controller.token(
        'client_credentials',
        '', '', 'smart-chat', 'secret',
        '', '', '', '',
        req,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'token.failed.unsupported_grant',
        clientId: 'smart-chat',
        success: false,
      }),
    );
  });

  it('records token.failed.audience_violation when audience denied', async () => {
    oauth.validateClientWithSecret.mockResolvedValue(m2mClient);
    oauth.issueClientCredentialsToken.mockRejectedValue(
      new BadRequestException('Audience "admin-panel" is not allowed for this client'),
    );

    await expect(
      controller.token(
        'client_credentials',
        '', '', 'smart-chat-brain', 'secret',
        '', '', '', 'admin-panel',
        req,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'token.failed.audience_violation',
        clientId: 'smart-chat-brain',
        audience: 'admin-panel',
        success: false,
      }),
    );
  });

  it('records token.failed.scope_violation when scope rejected', async () => {
    oauth.validateClientWithSecret.mockResolvedValue(m2mClient);
    oauth.issueClientCredentialsToken.mockRejectedValue(
      new BadRequestException('Scope(s) not allowed for this client: admin'),
    );

    await expect(
      controller.token(
        'client_credentials',
        '', '', 'smart-chat-brain', 'secret',
        '', '', 'admin', 'brain',
        req,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'token.failed.scope_violation',
        clientId: 'smart-chat-brain',
        success: false,
      }),
    );
  });

  it('records token.refreshed on refresh_token grant success', async () => {
    oauth.validateClientWithSecret.mockResolvedValue(userClient);
    oauth.refreshAccessToken.mockResolvedValue({
      accessToken: 'jwt',
      expiresIn: 600,
      refreshToken: 'rt',
      idToken: 'id',
      scope: 'openid profile',
    });

    await controller.token(
      'refresh_token',
      '', '', 'smart-chat', 'secret',
      '', 'rt-token', '', '',
      req,
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'token.refreshed',
        clientId: 'smart-chat',
        scopes: ['openid', 'profile'],
        success: true,
      }),
    );
  });
});
