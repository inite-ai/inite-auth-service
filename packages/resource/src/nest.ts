/**
 * NestJS bindings for @inite/auth-resource: a guard that verifies the
 * Authorization bearer credential and enforces @RequireScopes metadata.
 *
 * Wiring:
 *
 *   @Module({
 *     imports: [IniteAuthResourceModule.forRoot({ issuer, audience: 'brain' })],
 *   })
 *   export class AppModule {}
 *
 *   @UseGuards(IniteResourceGuard)
 *   @RequireScopes('brain:read')
 *   @Get('search') ...
 *
 * The verified principal is stamped on the request as `initeAuth`.
 */

import {
  CanActivate,
  DynamicModule,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Module,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  createTokenVerifier,
  ResourceVerifierConfig,
  TokenVerifier,
  VerifiedPrincipal,
} from './index';

export const INITE_TOKEN_VERIFIER = 'INITE_TOKEN_VERIFIER';
export const INITE_SCOPES_KEY = 'inite:required-scopes';

/** Route/controller metadata: every listed scope must be on the token. */
export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(INITE_SCOPES_KEY, scopes);

/** Request shape after the guard ran. */
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  initeAuth?: VerifiedPrincipal;
}

function bearerFrom(req: AuthenticatedRequest): string | null {
  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value || typeof value !== 'string') return null;
  const [scheme, token] = value.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

@Injectable()
export class IniteResourceGuard implements CanActivate {
  constructor(
    @Inject(INITE_TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerFrom(req);
    if (!token) {
      throw new UnauthorizedException('Missing bearer credential');
    }

    let principal: VerifiedPrincipal;
    try {
      principal = await this.verifier.verify(token);
    } catch {
      // Never leak why verification failed — a probe learns nothing.
      throw new UnauthorizedException('Invalid credential');
    }

    const required =
      this.reflector.getAllAndOverride<string[]>(INITE_SCOPES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];
    const missing = required.filter((s) => !principal.scopes.includes(s));
    if (missing.length > 0) {
      throw new ForbiddenException(`Missing required scope(s): ${missing.join(', ')}`);
    }

    req.initeAuth = principal;
    return true;
  }
}

@Module({})
export class IniteAuthResourceModule {
  static forRoot(config: ResourceVerifierConfig): DynamicModule {
    return {
      module: IniteAuthResourceModule,
      providers: [
        { provide: INITE_TOKEN_VERIFIER, useValue: createTokenVerifier(config) },
        IniteResourceGuard,
      ],
      exports: [INITE_TOKEN_VERIFIER, IniteResourceGuard],
    };
  }
}
