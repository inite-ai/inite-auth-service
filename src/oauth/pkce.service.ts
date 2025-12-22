import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class PkceService {
  /**
   * Verify PKCE code challenge
   */
  verifyCodeChallenge(
    codeVerifier: string,
    codeChallenge: string,
    method: string = 'S256',
  ): boolean {
    if (method === 'plain') {
      return codeVerifier === codeChallenge;
    }

    if (method === 'S256') {
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



