import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from 'jose';
import {
  TokenVerificationError,
  TokenVerifier,
  createTokenVerifier,
  principalFromClaims,
} from '../index';

const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'brain';

describe('@inite/auth-resource TokenVerifier', () => {
  let privateKey: CryptoKey;
  let verifier: TokenVerifier;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey as CryptoKey;
    const jwk = await exportJWK(pair.publicKey);
    const keySource = createLocalJWKSet({
      keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }],
    });
    verifier = createTokenVerifier({
      issuer: ISSUER,
      audience: AUDIENCE,
      keySource,
    });
  });

  function signToken(
    claims: Record<string, unknown>,
    opts: { audience?: string; expiresIn?: string; issuer?: string } = {},
  ): Promise<string> {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(opts.issuer ?? ISSUER)
      .setAudience(opts.audience ?? AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(opts.expiresIn ?? '5m')
      .sign(privateKey);
  }

  it('maps a user token (org present) to tenant=org, user=sub', async () => {
    const token = await signToken({
      sub: 'did:key:z6MkUser',
      org: 'co_acme',
      org_id: 'org-uuid-1',
      roles: ['user', 'admin'],
      scope: 'openid brain:read brain:write',
    });

    const principal = await verifier.verify(token);
    expect(principal.tenantId).toBe('co_acme');
    expect(principal.userId).toBe('did:key:z6MkUser');
    expect(principal.organizationId).toBe('org-uuid-1');
    expect(principal.scopes).toEqual(['openid', 'brain:read', 'brain:write']);
    expect(principal.roles).toEqual(['user', 'admin']);
    expect(principal.via).toBe('jwt');
  });

  it('maps an M2M token (no org) to tenant=sub with no userId', async () => {
    const token = await signToken({
      sub: 'co_acme',
      client_id: 'brain-service',
      scopes: ['brain:read', 'brain:write'],
    });

    const principal = await verifier.verify(token);
    expect(principal.tenantId).toBe('co_acme');
    expect(principal.userId).toBeUndefined();
    expect(principal.clientId).toBe('brain-service');
    expect(principal.scopes).toEqual(['brain:read', 'brain:write']);
  });

  it('surfaces the RFC 8693 act claim as actor', async () => {
    const token = await signToken({
      sub: 'did:key:z6MkUser',
      org: 'co_acme',
      act: { sub: 'brain-landing' },
      scope: 'brain:read',
    });

    const principal = await verifier.verify(token);
    expect(principal.actor).toEqual({ sub: 'brain-landing' });
  });

  it('rejects a token minted for another audience', async () => {
    const token = await signToken({ sub: 'did:key:z6MkUser' }, { audience: 'inbox' });
    await expect(verifier.verify(token)).rejects.toThrow(TokenVerificationError);
  });

  it('rejects a token from another issuer', async () => {
    const token = await signToken(
      { sub: 'did:key:z6MkUser' },
      { issuer: 'https://evil.example' },
    );
    await expect(verifier.verify(token)).rejects.toThrow(TokenVerificationError);
  });

  it('rejects an expired token', async () => {
    const token = await signToken({ sub: 'did:key:z6MkUser' }, { expiresIn: '-10m' });
    await expect(verifier.verify(token)).rejects.toThrow(/verification failed/);
  });

  it('rejects an opaque credential when introspection is not configured', async () => {
    await expect(verifier.verify('ik_opaque_api_key')).rejects.toMatchObject({
      code: 'unsupported_credential',
    });
  });

  describe('introspection fallback', () => {
    function introspectingVerifier(response: {
      ok?: boolean;
      status?: number;
      body?: Record<string, unknown>;
    }): { verifier: TokenVerifier; fetchMock: jest.Mock } {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: response.ok ?? true,
        status: response.status ?? 200,
        json: async () => response.body ?? {},
      });
      return {
        verifier: createTokenVerifier({
          issuer: ISSUER,
          audience: AUDIENCE,
          keySource: createLocalJWKSet({ keys: [] }),
          introspection: { clientId: 'brain-service', clientSecret: 's3cret' },
          fetchFn: fetchMock as unknown as typeof fetch,
        }),
        fetchMock,
      };
    }

    it('accepts an active opaque credential via RFC 7662', async () => {
      const { verifier: v, fetchMock } = introspectingVerifier({
        body: { active: true, sub: 'co_acme', scope: 'brain:read' },
      });

      const principal = await v.verify('ik_opaque_api_key');
      expect(principal.tenantId).toBe('co_acme');
      expect(principal.scopes).toEqual(['brain:read']);
      expect(principal.via).toBe('introspected');

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(`${ISSUER}/v1/oauth/introspect`);
      expect(String(init.body)).toContain('client_id=brain-service');
    });

    it('rejects an inactive credential', async () => {
      const { verifier: v } = introspectingVerifier({ body: { active: false } });
      await expect(v.verify('ik_revoked_key')).rejects.toThrow(/not active/);
    });

    it('maps endpoint failure to introspection_unavailable', async () => {
      const { verifier: v } = introspectingVerifier({ ok: false, status: 503 });
      await expect(v.verify('ik_opaque_api_key')).rejects.toMatchObject({
        code: 'introspection_unavailable',
      });
    });
  });

  describe('principalFromClaims', () => {
    it('throws on a missing sub', () => {
      expect(() => principalFromClaims({ scope: 'brain:read' }, 'jwt')).toThrow(
        /no sub claim/,
      );
    });

    it('caps scopes at 64', () => {
      const scopes = Array.from({ length: 100 }, (_, i) => `s${i}`);
      const principal = principalFromClaims({ sub: 'co_x', scopes }, 'jwt');
      expect(principal.scopes).toHaveLength(64);
    });
  });
});
