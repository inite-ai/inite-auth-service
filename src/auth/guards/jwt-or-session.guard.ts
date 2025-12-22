import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that accepts either JWT token OR session userId
 * Used for endpoints that need to work with both frontend (session) and backend (JWT)
 */
@Injectable()
export class JwtOrSessionGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    console.log('🔐 [JwtOrSessionGuard] Checking auth:', {
      hasSession: !!request.session,
      sessionId: request.session?.id,
      userId: request.session?.userId,
      hasAuthHeader: !!request.headers.authorization,
      cookies: request.headers.cookie?.substring(0, 100),
    });
    
    // Check if there's a session with userId
    if (request.session?.userId) {
      // User authenticated via session
      console.log('✅ [JwtOrSessionGuard] Auth via session:', request.session.userId);
      request.user = { userId: request.session.userId };
      return true;
    }
    
    // Try JWT authentication
    try {
      const result = await super.canActivate(context);
      console.log('✅ [JwtOrSessionGuard] Auth via JWT');
      return result as boolean;
    } catch (error) {
      console.log('❌ [JwtOrSessionGuard] Auth failed - no session and no valid JWT');
      throw new UnauthorizedException('Authentication required');
    }
  }
  
  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }
    return user;
  }
}

