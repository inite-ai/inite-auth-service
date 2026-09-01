import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SessionService } from './session.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';

@ApiTags('auth')
@Controller({ path: 'auth/session', version: '1' })
@UseGuards(JwtAuthGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get('active')
  async getActiveSessions(@CurrentUserId() userId: string) {
    return await this.sessionService.getActiveSessions(userId);
  }

  @Delete(':sessionId')
  async revokeSession(
    @CurrentUserId() userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    await this.sessionService.revokeSession(userId, sessionId);
    return { success: true };
  }

  /**
   * Revoke every session. `?except=<sessionId>` keeps one alive, which is
   * how the account page offers "sign out everywhere else" without logging
   * the user out of the tab they are securing the account from.
   */
  @Delete()
  async revokeAllSessions(
    @CurrentUserId() userId: string,
    @Query('except') except?: string,
  ) {
    await this.sessionService.revokeAllSessions(userId, except);
    return { success: true };
  }
}





