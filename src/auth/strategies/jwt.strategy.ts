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
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey || secret,
      algorithms: publicKey ? ['RS256'] : ['HS256'],
    });
  }

  async validate(payload: any) {
    // Log to debug token payload
    console.log('🟡 JWT STRATEGY validate: Token payload:', {
      userId: payload.userId,
      email: payload.email,
      sub: payload.sub,
    });
    
    const user = await this.authService.validateUser(payload.userId);
    if (!user) {
      console.error('🔴 JWT STRATEGY validate: User not found for userId:', payload.userId);
      throw new UnauthorizedException();
    }
    
    console.log('🟡 JWT STRATEGY validate: Found user:', {
      id: user.id,
      email: user.email,
      name: user.name,
    });
    
    return { 
      userId: user.id, 
      did: user.did, 
      email: user.email,
      metadata: user.metadata // Include metadata for admin role check
    };
  }
}

