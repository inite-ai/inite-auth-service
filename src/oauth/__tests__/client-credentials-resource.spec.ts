import { requestedAudience } from '../token-support';

/**
 * RFC 8707 on the client_credentials grant: a client that names its target
 * with `resource=` (as an MCP SDK or an agent does) gets a token for it,
 * instead of one silently bound to its own client id.
 */
describe('client_credentials requested audience', () => {
  it('uses `audience` when given (unchanged behaviour)', () => {
    expect(requestedAudience({ audience: 'brain' })).toBe('brain');
    expect(requestedAudience({ audience: 'brain', resource: 'https://x.test' })).toBe('brain');
  });

  it('falls back to the RFC 8707 `resource` indicator', () => {
    expect(requestedAudience({ resource: 'https://billing.inite.ai/v1/agent-wallet' })).toBe(
      'https://billing.inite.ai/v1/agent-wallet',
    );
  });

  it('takes the first of a repeated resource', () => {
    expect(requestedAudience({ resource: ['https://a.test', 'https://b.test'] })).toBe('https://a.test');
  });

  it('ignores a resource the client may not have, as before (no new 400)', () => {
    expect(requestedAudience({ resource: 'https://evil.test' }, ['brain'])).toBeUndefined();
    expect(requestedAudience({ resource: 'brain' }, ['brain', 'chat-api'])).toBe('brain');
  });

  it('is undefined when neither is given — the client default applies', () => {
    expect(requestedAudience({})).toBeUndefined();
    expect(requestedAudience({ audience: '', resource: '  ' })).toBeUndefined();
  });
});
