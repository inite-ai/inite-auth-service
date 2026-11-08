import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PKCE_METHOD } from './pkce-method';

@Injectable()
export class PkceService {
  /**
   * Verify a PKCE code challenge. S256 only: discovery advertises S256 alone,
   * and a `plain` challenge is the verifier itself, so it proves nothing to
   * whoever saw the authorization request. A stored `plain` code never
   * verifies.
   */
  verifyCodeChallenge(
    codeVerifier: string,
    codeChallenge: string,
    method: string = PKCE_METHOD,
  ): boolean {
    if (method === PKCE_METHOD) {
      const hash = crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
      return hash === codeChallenge;
    }

    return false;
  }

  /**
   * Generate code challenge from verifier (for testing)
   */
  generateCodeChallenge(codeVerifier: string, method: string = 'S256'): string {
    if (method === 'plain') {
      return codeVerifier;
    }

    if (method === 'S256') {
      return crypto
        .createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
    }

    throw new Error(`Unsupported code challenge method: ${method}`);
  }

  /**
   * Generate random code verifier (for testing)
   */
  generateCodeVerifier(): string {
    return crypto.randomBytes(32).toString('base64url');
  }
}





