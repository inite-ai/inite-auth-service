import { sanitizeCustomClaims } from '../custom-claims';

describe('sanitizeCustomClaims', () => {
  it('keeps only allow-listed keys with identifier-charset string arrays', () => {
    expect(
      sanitizeCustomClaims({
        policy: ['support-reader', 'BAD NAME!', 42, 'no-pii'],
        packs: ['real_estate'],
        sub: 'hijack',
        aud: ['evil'],
        role: ['admin'],
      }),
    ).toEqual({
      policy: ['support-reader', 'no-pii'],
      packs: ['real_estate'],
    });
  });

  it('degrades malformed input to no claims, never throws', () => {
    expect(sanitizeCustomClaims(null)).toEqual({});
    expect(sanitizeCustomClaims('policy')).toEqual({});
    expect(sanitizeCustomClaims(['policy'])).toEqual({});
    expect(sanitizeCustomClaims({ policy: 'not-an-array' })).toEqual({});
    expect(sanitizeCustomClaims({ policy: [] })).toEqual({});
  });

  it('caps values per key', () => {
    const many = Array.from({ length: 32 }, (_, i) => `set-${i}`);
    expect(sanitizeCustomClaims({ policy: many }).policy).toHaveLength(16);
  });
});
