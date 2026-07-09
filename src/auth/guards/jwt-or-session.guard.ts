import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { createLogger } from '../../common/logger.service';
import type { AuthenticatedUser } from '../authenticated-user';

const logger = createLogger('JwtOrSessionGuard');

/**
 * Guard that accepts either JWT token OR session userId
 * Used for endpoints that work with both frontend (session) and backend (JWT)
 */
@Injectable()
export class JwtOrSessionGuard extends AuthGuard('jwt') {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    logger.debug('Checking auth', {
      hasSession: !!request.session,
      sessionId: request.session?.id,
      userId: request.session?.userId,
      hasAuthHeader: !!request.headers.authorization,
    });
    
    // Check session first
    if (request.session?.userId) {
      logger.verbose(`Auth via session: ${request.session.userId}`);
      request.user = { userId: request.session.userId };
      return true;
    }
    
    // Try JWT
    try {
      const result = await super.canActivate(context);
      logger.verbose('Auth via JWT');
      return result as boolean;
    } catch {
      logger.debug('Auth failed - no session and no valid JWT');
      throw new UnauthorizedException('Authentication required');
    }
  }
  
  override handleRequest<TUser = AuthenticatedUser>(
    err: unknown,
    user: TUser | false | null,
  ): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    return user;
  }
}
