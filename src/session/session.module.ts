import { Module } from '@nestjs/common';
import { SessionService } from './session.service';
import { SessionController } from './session.controller';
import { OAuthModule } from '../oauth/oauth.module';

@Module({
  imports: [OAuthModule],
  providers: [SessionService],
  controllers: [SessionController],
  exports: [SessionService],
})
export class SessionModule {}
