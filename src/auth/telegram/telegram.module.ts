import { Module } from '@nestjs/common';
import { FederationModule } from '../federation/federation.module';
import { OAuthModule } from '../../oauth/oauth.module';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramWebAppService } from './telegram-webapp.service';
import { TelegramBotsStore } from './telegram-bots.store';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramAuthController } from './telegram-auth.controller';
import { TelegramLinkController } from './telegram-link.controller';

/**
 * Telegram as a sign-in provider (Login Widget and Mini App initData).
 * FederationModule gives the OAuthIdentity linking every external provider
 * shares; OAuthModule gives the registry, consent and code issuance the
 * Mini App path reuses. Redis, settings and config come from global modules.
 */
@Module({
  imports: [FederationModule, OAuthModule],
  providers: [TelegramAuthService, TelegramWebAppService, TelegramBotsStore, TelegramLinkService],
  controllers: [TelegramAuthController, TelegramLinkController],
})
export class TelegramModule {}
