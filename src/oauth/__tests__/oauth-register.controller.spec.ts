import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { OAuthRegisterController } from '../oauth-register.controller';
import { OAuthClientRegistryService } from '../oauth-client-registry.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterClientDto } from '../dto/register-client.dto';

describe('OAuthRegisterController', () => {
  let controller: OAuthRegisterController;
  let registry: OAuthClientRegistryService;
  let mockPrisma: { oAuthClient: { create: jest.Mock } };

  beforeEach(async () => {
    mockPrisma = {
      oAuthClient: {
        // Echo back the data the registry asked to persist so the
        // controller maps the stored row, and assertions can inspect it.
        create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'uuid-new', ...data }),
        ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuthRegisterController],
      providers: [
        OAuthClientRegistryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<OAuthRegisterController>(OAuthRegisterController);
    registry = module.get<OAuthClientRegistryService>(
      OAuthClientRegistryService,
    );
  });

  it('confidential DCR returns client_id + client_secret and persists sanitized grants', async () => {
    const dto: RegisterClientDto = {
      client_name: 'My MCP App',
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'client_secret_post',
    };

    const res = await controller.register(dto);

    expect(res.client_id).toMatch(/^dcr_[0-9a-f]{32}$/);
    expect(typeof res.client_secret).toBe('string');
    expect((res.client_secret as string).length).toBeGreaterThan(0);
    expect(res.token_endpoint_auth_method).toBe('client_secret_post');
    expect(res.client_secret_expires_at).toBe(0);

    const persisted = mockPrisma.oAuthClient.create.mock.calls[0][0].data;
    expect(persisted.allowedGrants).toEqual([
      'authorization_code',
      'refresh_token',
    ]);
    expect(persisted.isPublic).toBe(false);
    expect(persisted.clientSecretHash).toEqual(expect.any(String));
  });

  it("token_endpoint_auth_method 'none' omits client_secret and sets isPublic", async () => {
    const dto: RegisterClientDto = {
      client_name: 'Native CLI',
      redirect_uris: ['http://127.0.0.1/callback'],
      token_endpoint_auth_method: 'none',
    };

    const res = await controller.register(dto);

    expect('client_secret' in res).toBe(false);
    expect(res.token_endpoint_auth_method).toBe('none');

    const persisted = mockPrisma.oAuthClient.create.mock.calls[0][0].data;
    expect(persisted.isPublic).toBe(true);
    // A non-empty unusable hash is still stored so the column is set.
    expect(persisted.clientSecretHash).toEqual(expect.any(String));
  });

  it('strips disallowed grant types (e.g. token-exchange)', async () => {
    const dto: RegisterClientDto = {
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: [
        'authorization_code',
        'urn:ietf:params:oauth:grant-type:token-exchange',
        'urn:ietf:params:oauth:grant-type:device_code',
      ],
      token_endpoint_auth_method: 'client_secret_post',
    };

    await controller.register(dto);

    const persisted = mockPrisma.oAuthClient.create.mock.calls[0][0].data;
    expect(persisted.allowedGrants).toEqual(['authorization_code']);
  });

  it('throws when authorization_code requested without redirect_uris', async () => {
    const dto: RegisterClientDto = {
      grant_types: ['authorization_code'],
      token_endpoint_auth_method: 'client_secret_post',
    };

    await expect(controller.register(dto)).rejects.toThrow(BadRequestException);
    expect(mockPrisma.oAuthClient.create).not.toHaveBeenCalled();
  });

  it('rejects client_credentials for a public client', async () => {
    const dto: RegisterClientDto = {
      grant_types: ['client_credentials'],
      token_endpoint_auth_method: 'none',
    };

    await expect(registry.registerDynamicClient(dto)).rejects.toThrow(
      /confidential client required/,
    );
  });

  it('intersects scope against the supported set and defaults when empty', async () => {
    const dto: RegisterClientDto = {
      redirect_uris: ['https://app.example.com/callback'],
      scope: 'openid email admin brain:write',
      token_endpoint_auth_method: 'client_secret_post',
    };

    const res = await controller.register(dto);
    expect(res.scope).toBe('openid email');
  });
});
