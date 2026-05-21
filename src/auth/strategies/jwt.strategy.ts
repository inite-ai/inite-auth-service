import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    const publicKey = configService.get<string>('JWT_PUBLIC_KEY');
    const secret = configService.get<string>('JWT_SECRET');
    const nodeEnv = configService.get<string>('NODE_ENV', 'development');

    if (nodeEnv === 'production' && !publicKey) {
      throw new Error(
        'JWT_PUBLIC_KEY must be set in production. HS256 fallback is dev-only.',
      );
    }
    if (!publicKey && !secret) {
      throw new Error('Either JWT_PUBLIC_KEY or JWT_SECRET must be set');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey || secret,
      // Explicit allow-list — passport-jwt rejects any other alg
      // including "none". Single-entry list per environment so a
      // downgrade attack (RS256-token-presented-as-HS256) can't sign
      // with the public key as if it were a shared secret.
      algorithms: publicKey ? ['RS256'] : ['HS256'],
    });
  }

  async validate(payload: any) {
    // M2M (client_credentials) tokens don't carry a userId — they
    // represent a backend service, not a person. Surface them as a
    // distinct `kind: 'machine'` principal so downstream guards
    // (e.g. AdminGuard) can authorize off the `scope` claim instead
    // of falling through to the user-lookup path which would 401.
    if (!payload.userId) {
      const scope = normalizeScope(payload.scope ?? payload.scopes);
      const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
      return {
        kind: 'machine',
        sub: payload.sub,
        clientId: aud ?? payload.client_id ?? null,
        audience: payload.aud ?? null,
        companyId: payload.companyId ?? null,
        scope,
      };
    }

    const user = await this.authService.validateUser(payload.userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      kind: 'user',
      userId: user.id,
      did: user.did,
      email: user.email,
      metadata: user.metadata,
      scope: normalizeScope(payload.scope ?? payload.scopes),
    };
  }
}

/**
 * Coerce the assorted scope shapes we see in the wild into a Set:
 *  - space-separated string (OAuth core)
 *  - already an array (some internal codepaths use `scopes: string[]`)
 *  - empty / missing → empty Set
 */
function normalizeScope(input: unknown): Set<string> {
  if (!input) return new Set();
  if (Array.isArray(input)) return new Set(input.filter((s) => typeof s === 'string'));
  if (typeof input === 'string') {
    return new Set(input.split(/\s+/).filter(Boolean));
  }
  return new Set();
}
