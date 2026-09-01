import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IdentityService } from './identity.service';
import { IdentityMfaService } from './identity-mfa.service';
import { IdentityAccountService } from './identity-account.service';
import { IdentityEmailService } from './identity-email.service';
import { TonWalletService } from './ton-wallet.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from '../auth/decorators/current-user.decorator';
import { LinkWalletDto } from './dto/link-wallet.dto';
import { IssueCredentialDto } from './dto/issue-credential.dto';
import { WalletMessageDto } from './dto/wallet-message.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangeEmailDto } from './dto/change-email.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { Disable2faDto } from './dto/disable-2fa.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { RegenerateBackupCodesDto } from './dto/regenerate-backup-codes.dto';
import { LinkTonWalletDto } from './dto/link-ton-wallet.dto';
import { readPendingEmailChange } from './pending-email-change';

@ApiTags('identity')
@Controller({ path: 'auth/identity', version: '1' })
export class IdentityController {
  // eslint-disable-next-line max-params -- NestJS DI constructor (per-parameter injection, not a call API)
  constructor(
    private readonly identityService: IdentityService,
    private readonly mfaService: IdentityMfaService,
    private readonly accountService: IdentityAccountService,
    private readonly emailService: IdentityEmailService,
    private readonly tonWalletService: TonWalletService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUserId() userId: string) {
    const user = await this.identityService.getIdentityById(userId);
    // bio/location/profession are editable via PUT /profile, so they must
    // also be readable here — omitting them made the account page's edit
    // form initialise from `undefined` and blank the stored values on save.
    return {
      id: user.id,
      did: user.did,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      avatarUrl: user.avatarUrl,
      bio: user.bio,
      location: user.location,
      profession: user.profession,
      pendingEmailChange: readPendingEmailChange(user.metadata),
      metadata: user.metadata,
      createdAt: user.createdAt,
    };
  }

  @Get('did')
  @UseGuards(JwtAuthGuard)
  async getDid(@CurrentUserId() userId: string) {
    const user = await this.identityService.getIdentityById(userId);
    return { did: user.did };
  }

  @Get('did-document')
  @UseGuards(JwtAuthGuard)
  async getDidDocument(@CurrentUserId() userId: string) {
    return await this.identityService.getDidDocument(userId);
  }

  @Get('wallets')
  @UseGuards(JwtAuthGuard)
  async getWallets(@CurrentUserId() userId: string) {
    return await this.identityService.getWallets(userId);
  }

  @Post('wallet/link')
  @UseGuards(JwtAuthGuard)
  async linkWallet(
    @CurrentUserId() userId: string,
    @Body() body: LinkWalletDto,
  ) {
    return await this.identityService.linkWallet({
      userId,
      address: body.address,
      chain: body.chain,
      message: body.message,
      signature: body.signature,
      publicKey: body.publicKey,
    });
  }

  @Delete('wallet/:walletId')
  @UseGuards(JwtAuthGuard)
  async unlinkWallet(
    @CurrentUserId() userId: string,
    @Param('walletId') walletId: string,
  ) {
    await this.identityService.unlinkWallet(userId, walletId);
    return { success: true };
  }

  @Post('credentials/issue')
  @UseGuards(JwtAuthGuard)
  async issueCredential(
    @CurrentUserId() userId: string,
    @Body() body: IssueCredentialDto,
  ) {
    return await this.identityService.issueCredential(
      userId,
      body.type,
      body.claims,
    );
  }

  @Post('wallet/siwe-message')
  @UseGuards(JwtAuthGuard)
  async generateSiweMessage(
    @CurrentUserId() userId: string,
    @Body() body: WalletMessageDto,
  ) {
    const user = await this.identityService.getIdentityById(userId);
    const message = this.identityService.generateSiweMessage(
      body.address,
      user.did,
      body.nonce,
    );
    return { message };
  }

  /** Mint the single-use payload a wallet must sign for ton_proof. */
  @Post('wallet/ton/payload')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async issueTonPayload(@CurrentUserId() userId: string) {
    return await this.tonWalletService.issuePayload(userId);
  }

  @Post('wallet/ton/link')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async linkTonWallet(
    @CurrentUserId() userId: string,
    @Body() body: LinkTonWalletDto,
  ) {
    return await this.tonWalletService.linkWithProof({ userId, ...body });
  }

  // ==================== Profile Management ====================

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @CurrentUserId() userId: string,
    @Body() body: UpdateProfileDto,
  ) {
    return await this.accountService.updateProfile(userId, body);
  }

  @Post('email/change')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async changeEmail(
    @CurrentUserId() userId: string,
    @Body() body: ChangeEmailDto,
  ) {
    await this.emailService.requestEmailChange(userId, body.newEmail, body.password);
    return { success: true, message: 'Verification email sent to new address' };
  }

  @Post('email/resend-verification')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resendEmailVerification(@CurrentUserId() userId: string) {
    await this.emailService.resendEmailVerification(userId);
    return { success: true, message: 'Verification email sent' };
  }

  @Post('email/change/cancel')
  @UseGuards(JwtAuthGuard)
  async cancelEmailChange(@CurrentUserId() userId: string) {
    await this.emailService.cancelEmailChange(userId);
    return { success: true, message: 'Pending email change cancelled' };
  }

  @Post('email/verify')
  async verifyEmail(@Body() body: VerifyEmailDto) {
    return await this.emailService.verifyEmail(body.token);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(
    @CurrentUserId() userId: string,
    @Body() body: ChangePasswordDto,
  ) {
    await this.accountService.changePassword(
      userId,
      body.currentPassword,
      body.newPassword,
    );
    return { success: true, message: 'Password changed successfully' };
  }

  @Get('security-status')
  @UseGuards(JwtAuthGuard)
  async getSecurityStatus(@CurrentUserId() userId: string) {
    return await this.mfaService.getSecurityStatus(userId);
  }

  // ==================== 2FA Management ====================

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  async setup2FA(@CurrentUserId() userId: string) {
    return await this.mfaService.setup2FA(userId);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  async enable2FA(
    @CurrentUserId() userId: string,
    @Body() body: TwoFactorCodeDto,
  ) {
    return await this.mfaService.enable2FA(userId, body.code);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  async disable2FA(
    @CurrentUserId() userId: string,
    @Body() body: Disable2faDto,
  ) {
    return await this.mfaService.disable2FA(userId, body.code, body.password);
  }

  @Post('2fa/backup-codes')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async regenerateBackupCodes(
    @CurrentUserId() userId: string,
    @Body() body: RegenerateBackupCodesDto,
  ) {
    return await this.mfaService.regenerateBackupCodes(userId, body.password);
  }

  @Post('2fa/verify')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verify2FA(
    @CurrentUserId() userId: string,
    @Body() body: TwoFactorCodeDto,
  ) {
    return await this.mfaService.verify2FA(userId, body.code);
  }

  // ==================== Data Export & Account Deletion ====================

  @Get('export')
  @UseGuards(JwtAuthGuard)
  async exportData(@CurrentUserId() userId: string) {
    return await this.accountService.exportUserData(userId);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(
    @CurrentUserId() userId: string,
    @Body() body: DeleteAccountDto,
  ) {
    await this.accountService.deleteAccount(userId, body.password);
    return { success: true, message: 'Account deleted successfully' };
  }
}
