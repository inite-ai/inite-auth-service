import * as crypto from 'crypto';
import type { ConfigService } from '@nestjs/config';

/**
 * Compute the deterministic lookup hash for a refresh token.
 * Uses HMAC-SHA256 with a server-side secret, so:
 *   - Lookup is O(1) via a unique index (was O(N) bcrypt-scan).
 *   - DB read alone cannot forge a token (still requires the HMAC secret).
 *   - The HMAC value is BOTH the lookup key AND the verification — match
 *     means the token was minted by this server.
 */
export function hashRefreshToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('base64url');
}

/**
 * The refresh-token HMAC secret. Falls back to JWT_SECRET only so dev
 * setups don't break, but production MUST set REFRESH_TOKEN_HMAC_SECRET
 * explicitly — using JWT_SECRET means leaking either burns both surfaces.
 */
export function refreshTokenSecret(configService: ConfigService): string {
  const explicit = configService.get<string>('REFRESH_TOKEN_HMAC_SECRET');
  if (explicit && explicit.trim().length > 0) return explicit;

  // In production the dedicated secret is mandatory — falling back to
  // JWT_SECRET means a leak of either one burns both surfaces.
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  if (nodeEnv === 'production') {
    throw new Error(
      'REFRESH_TOKEN_HMAC_SECRET must be set in production (JWT_SECRET fallback is dev-only).',
    );
  }

  const fallback = configService.get<string>('JWT_SECRET');
  if (!fallback) {
    throw new Error('REFRESH_TOKEN_HMAC_SECRET (or JWT_SECRET fallback) must be set');
  }
  return fallback;
}
