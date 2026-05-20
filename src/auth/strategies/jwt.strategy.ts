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
    const user = await this.authService.validateUser(payload.userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      userId: user.id,
      did: user.did,
      email: user.email,
      metadata: user.metadata,
    };
  }
}
