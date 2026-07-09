import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedUser } from '../authenticated-user';

/**
 * Injects the typed `req.user` principal (see AuthenticatedUser). Use behind a
 * JWT guard so it is always populated. Replaces the `@Req() req: any` +
 * `req.user` pattern with a typed, discriminated union.
 *
 *   @Get() me(@CurrentUser() user: AuthenticatedUser) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    if (!req.user) {
      throw new UnauthorizedException();
    }
    return req.user;
  },
);

/**
 * Injects the authenticated user's id. For user-flow endpoints that only need
 * the id; throws 401 for a machine (M2M) principal, which has no user.
 *
 *   @Get('me') me(@CurrentUserId() userId: string) { ... }
 */
export const CurrentUserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = req.user;
    if (!user || user.kind !== 'user') {
      throw new UnauthorizedException('user access token required');
    }
    return user.userId;
  },
);
