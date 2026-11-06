import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
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
      providers: [OAuthClientRegistryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    controller = module.get<OAuthRegisterController>(OAuthRegisterController);
    registry = module.get<OAuthClientRegistryService>(OAuthClientRegistryService);
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
    expect(persisted.allowedGrants).toEqual(['authorization_code', 'refresh_token']);
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

  // Behaviour change, 2026-09-06. This used to assert the opposite: that a
  // withheld grant was dropped and registration answered 201. It is legal
  // under RFC 7591 either way, and it cost an afternoon in practice — a caller
  // reads device_code in `grant_types_supported` (correctly: RFC 8414
  // describes the server, not a client), registers asking for it, is told
  // yes, and only learns otherwise at /device_authorization, which refuses
  // the client this server had just issued. Two events far enough apart to be
  // hard to connect.
  it.each([
    ['urn:ietf:params:oauth:grant-type:device_code', /device grant is provisioned by an operator/],
    [
      'urn:ietf:params:oauth:grant-type:token-exchange',
      /token exchange is provisioned by an operator/,
    ],
  ])('refuses %s and says why', async (grant, reason) => {
    const dto: RegisterClientDto = {
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: ['authorization_code', grant],
      token_endpoint_auth_method: 'client_secret_post',
    };

    await expect(controller.register(dto)).rejects.toThrow(reason);
    expect(mockPrisma.oAuthClient.create).not.toHaveBeenCalled();
  });

  it('still narrows a grant it simply does not implement', async () => {
    // Forgiving where forgiveness costs nothing: a grant nobody offers cannot
    // be reached later, so dropping it strands no one.
    const dto: RegisterClientDto = {
      redirect_uris: ['https://app.example.com/callback'],
      grant_types: ['authorization_code', 'urn:example:grant:invented'],
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
      // brain:write is DCR-allowed (vertical user scope); admin and
      // brain:admin are operator-provisioned only and must be dropped.
      scope: 'openid email admin brain:write brain:admin',
      token_endpoint_auth_method: 'client_secret_post',
    };

    const res = await controller.register(dto);
    expect(res.scope).toBe('openid email brain:write');
  });
});

/**
 * Over HTTP, with the app's own global ValidationPipe (main.ts): the route
 * pipe, the interceptor and the global pipe only meet here, so a direct
 * controller call cannot show what a client actually gets.
 */
describe('POST /oauth/register over HTTP (RFC 7591)', () => {
  let app: INestApplication;
  let create: jest.Mock;

  beforeEach(async () => {
    create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'uuid-new', ...data }),
    );
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OAuthRegisterController],
      providers: [
        OAuthClientRegistryService,
        { provide: PrismaService, useValue: { oAuthClient: { create } } },
      ],
    }).compile();
    app = module.createNestApplication();
    // Same options as main.ts — the strict pipe the register route must survive.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const post = (body: unknown) =>
    request(app.getHttpServer()).post('/oauth/register').send(body as object);

  it('ignores metadata it does not understand (§3.1) and registers the client', async () => {
    const res = await post({
      client_name: 'Connector',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      token_endpoint_auth_method: 'none',
      some_vendor_field: 'whatever',
      another_new_field: { nested: true },
    });

    expect(res.status).toBe(201);
    expect(res.body.client_id).toMatch(/^dcr_/);
    expect(res.body).not.toHaveProperty('some_vendor_field');
    expect(res.body).not.toHaveProperty('another_new_field');
    // The unknown field never reaches the registry, let alone the row.
    const persisted = create.mock.calls[0][0].data;
    expect(JSON.stringify(persisted)).not.toContain('some_vendor_field');
  });

  it('still validates the fields it declares', async () => {
    const res = await post({
      redirect_uris: ['https://app.example.com/cb'],
      token_endpoint_auth_method: 'client_secret_basic_or_whatever',
    });

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      error: 'invalid_client_metadata',
      error_description: expect.stringContaining('token_endpoint_auth_method'),
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('answers invalid_redirect_uri when redirect_uris is missing', async () => {
    const res = await post({ client_name: 'No callback' });

    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      error: 'invalid_redirect_uri',
      error_description: expect.stringContaining('redirect_uris'),
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('answers invalid_redirect_uri when a redirect URI is not a URL', async () => {
    const res = await post({ redirect_uris: ['not a url'] });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_redirect_uri');
  });

  it('answers invalid_client_metadata for a withheld grant', async () => {
    const res = await post({
      redirect_uris: ['https://app.example.com/cb'],
      grant_types: ['authorization_code', 'urn:ietf:params:oauth:grant-type:device_code'],
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid_client_metadata',
      error_description: expect.stringContaining('device grant is provisioned by an operator'),
    });
  });

  it('answers invalid_client_metadata for client_credentials on a public client', async () => {
    const res = await post({ grant_types: ['client_credentials'], token_endpoint_auth_method: 'none' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_client_metadata');
  });

  it('answers invalid_client_metadata for a jwks check (shared helper keeps its Nest shape elsewhere)', async () => {
    const res = await post({
      redirect_uris: ['https://app.example.com/cb'],
      token_endpoint_auth_method: 'private_key_jwt',
    });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'invalid_client_metadata',
      error_description: 'private_key_jwt requires jwks or jwks_uri',
    });
  });

  it('refuses a body that is not a JSON object', async () => {
    const res = await post([{ redirect_uris: ['https://app.example.com/cb'] }]);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_client_metadata');
  });
});
