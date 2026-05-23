import { Module } from '@nestjs/common';
import { MCPLoginController } from './mcp-login.controller';
import { OAuthModule } from '../oauth/oauth.module';
import { IdentityModule } from '../identity/identity.module';

@Module({
  imports: [OAuthModule, IdentityModule],
  controllers: [MCPLoginController],
})
export class MCPLoginModule {}
