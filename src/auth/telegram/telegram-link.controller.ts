import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '../decorators/current-user.decorator';
import { AuthenticatedUser } from '../authenticated-user';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramBotsStore } from './telegram-bots.store';
import { TelegramLinkService } from './telegram-link.service';
import { TelegramAuthError } from './contracts/telegram-auth.error';
import { TelegramLinkDto } from './dto/telegram-link.dto';
import { TelegramImportDto } from './dto/telegram-import.dto';

/** The scope a first-party product's machine token needs to import its old links. */
export const TELEGRAM_LINK_SCOPE = 'telegram:link';

/**
 * Attaching Telegram to an INITE account that already exists (TelegramLinkService).
 * Off with the rest of the provider (404).
 *
 *   POST /v1/auth/telegram/link { ticket }  (Bearer: the person's access token)
 *        → links the ticket's Telegram user (from a Mini App sign-in with
 *          create_user: false) to that person's account.
 *   POST /v1/auth/telegram/identities/import { links: [{ user, telegram_id }] }
 *        (Bearer: a first-party product's machine token with telegram:link,
 *        requested without an audience so its `aud` is the product's client)
 *        → carries over links the product verified before; never moves one.
 */
@ApiTags('auth')
@Controller({ path: 'auth/telegram', version: '1' })
export class TelegramLinkController {
  constructor(
    private readonly telegram: TelegramAuthService,
    private readonly links: TelegramLinkService,
    private readonly bots: TelegramBotsStore,
  ) {}

  @Post('link')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Link a Mini App sign-in ticket to the signed-in person' })
  async link(@CurrentUser() principal: AuthenticatedUser, @Body() body: TelegramLinkDto) {
    this.telegram.assertEnabled();
    if (principal.kind !== 'user') {
      throw new ForbiddenException({
        error: 'access_denied',
        error_description: 'user_token_required',
      });
    }
    try {
      const { telegram, outcome } = await this.links.redeem(body.ticket, principal.userId);
      return {
        telegram: { id: telegram.id, username: telegram.username, first_name: telegram.firstName },
        outcome,
      };
    } catch (err) {
      if (err instanceof TelegramAuthError) {
        throw new BadRequestException({ error: 'invalid_grant', error_description: err.reason });
      }
      throw err;
    }
  }

  @Post('identities/import')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: "Carry over a first-party product's verified Telegram links" })
  async importIdentities(
    @CurrentUser() principal: AuthenticatedUser,
    @Body() body: TelegramImportDto,
  ) {
    this.telegram.assertEnabled();
    if (principal.kind !== 'machine' || !principal.scope.has(TELEGRAM_LINK_SCOPE)) {
      throw new ForbiddenException({
        error: 'insufficient_scope',
        error_description: TELEGRAM_LINK_SCOPE,
      });
    }
    // Only a product that has a bot here vouches for Telegram users at all.
    const clientId = principal.clientId ?? '';
    if (this.bots.forClient(clientId).length === 0) {
      throw new ForbiddenException({ error: 'access_denied', error_description: 'bot_not_bound' });
    }
    return this.links.importLinks(body.links, clientId);
  }
}
