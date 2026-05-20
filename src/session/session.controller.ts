import {
  Controller,
  Get,
  Delete,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SessionService } from './session.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller({ path: 'auth/session', version: '1' })
@UseGuards(JwtAuthGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get('active')
  async getActiveSessions(@Request() req: any) {
    return await this.sessionService.getActiveSessions(req.user.userId);
  }

  @Delete(':sessionId')
  async revokeSession(@Request() req: any, @Param('sessionId') sessionId: string) {
    await this.sessionService.revokeSession(req.user.userId, sessionId);
    return { success: true };
  }

  @Delete()
  async revokeAllSessions(@Request() req: any) {
    await this.sessionService.revokeAllSessions(req.user.userId);
    return { success: true };
  }
}





