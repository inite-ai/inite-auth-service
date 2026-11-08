import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PkceService } from '../pkce.service';
import { assertS256Method } from '../pkce-method';

/**
 * Security property: PKCE is S256 only, on every path that makes a code.
 *
 * Discovery advertises `code_challenge_methods_supported: ["S256"]` and
 * /authorize refused `plain`, but `POST /v1/oauth/session/create-code` stored
 * whatever method it was given and PkceService still verified `plain` at
 * /token. A `plain` challenge is the verifier itself, so anyone who sees the
 * authorization request (logs, referrer, a malicious app on the redirect)
 * can redeem the code.
 */
describe('PKCE: S256 only', () => {
  const pkce = new PkceService();
  const verifier = 'a'.repeat(43);

  it('a plain challenge never verifies at /token, even when verifier === challenge', () => {
    expect(pkce.verifyCodeChallenge(verifier, verifier, 'plain')).toBe(false);
  });

  it('an unknown method never verifies', () => {
    expect(pkce.verifyCodeChallenge(verifier, verifier, 'none')).toBe(false);
  });

  it('S256 still verifies', () => {
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    expect(pkce.verifyCodeChallenge(verifier, challenge, 'S256')).toBe(true);
    expect(pkce.verifyCodeChallenge('b'.repeat(43), challenge, 'S256')).toBe(false);
  });

  it('code creation refuses plain and anything else but S256; absent means S256', () => {
    expect(() => assertS256Method('plain')).toThrow(BadRequestException);
    expect(() => assertS256Method('s256')).toThrow(BadRequestException);
    expect(() => assertS256Method('')).not.toThrow();
    expect(() => assertS256Method(undefined)).not.toThrow();
    expect(() => assertS256Method('S256')).not.toThrow();
  });
});
