import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IdentityService } from './identity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('identity')
@Controller({ path: 'auth/identity', version: '1' })
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: any) {
    const user = await this.identityService.getIdentityById(req.user.userId);
    return {
      id: user.id,
      did: user.did,
      email: user.email,
      emailVerified: user.emailVerified,
      name: user.name,
      avatarUrl: user.avatarUrl,
      metadata: user.metadata,
      createdAt: user.createdAt,
    };
  }

  @Get('did')
  @UseGuards(JwtAuthGuard)
  async getDid(@Request() req: any) {
    const user = await this.identityService.getIdentityById(req.user.userId);
    return { did: user.did };
  }

  @Get('did-document')
  @UseGuards(JwtAuthGuard)
  async getDidDocument(@Request() req: any) {
    return await this.identityService.getDidDocument(req.user.userId);
  }

  @Get('wallets')
  @UseGuards(JwtAuthGuard)
  async getWallets(@Request() req: any) {
    return await this.identityService.getWallets(req.user.userId);
  }

  @Post('wallet/link')
  @UseGuards(JwtAuthGuard)
  async linkWallet(
    @Request() req: any,
    @Body()
    body: {
      address: string;
      chain: string;
      message: string;
      signature: string;
      publicKey?: string; // Required for TON
    },
  ) {
    return await this.identityService.linkWallet(
      req.user.userId,
      body.address,
      body.chain,
      body.message,
      body.signature,
      body.publicKey,
    );
  }

  @Delete('wallet/:walletId')
  @UseGuards(JwtAuthGuard)
  async unlinkWallet(@Request() req: any, @Param('walletId') walletId: string) {
    await this.identityService.unlinkWallet(req.user.userId, walletId);
    return { success: true };
  }

  @Post('credentials/issue')
  @UseGuards(JwtAuthGuard)
  async issueCredential(
    @Request() req: any,
    @Body() body: { type: string; claims: Record<string, any> },
  ) {
    return await this.identityService.issueCredential(
      req.user.userId,
      body.type,
      body.claims,
    );
  }

  @Post('wallet/siwe-message')
  @UseGuards(JwtAuthGuard)
  async generateSiweMessage(
    @Request() req: any,
    @Body() body: { address: string; nonce: string },
  ) {
    const user = await this.identityService.getIdentityById(req.user.userId);
    const message = this.identityService.generateSiweMessage(
      body.address,
      user.did,
      body.nonce,
    );
    return { message };
  }

  @Post('wallet/ton-message')
  @UseGuards(JwtAuthGuard)
  async generateTonMessage(
    @Request() req: any,
    @Body() body: { address: string; nonce: string },
  ) {
    const user = await this.identityService.getIdentityById(req.user.userId);
    const { message, payload } = this.identityService.generateTonMessage(
      body.address,
      user.did,
      body.nonce,
    );
    return { message, payload };
  }

  // ==================== Profile Management ====================

  @Put('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @Request() req: any,
    @Body() body: { name?: string; avatarUrl?: string; bio?: string; location?: string; profession?: string },
  ) {
    return await this.identityService.updateProfile(req.user.userId, body);
  }

  @Post('email/change')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async changeEmail(
    @Request() req: any,
    @Body() body: { newEmail: string; password: string },
  ) {
    await this.identityService.requestEmailChange(req.user.userId, body.newEmail, body.password);
    return { success: true, message: 'Verification email sent to new address' };
  }

  @Post('email/resend-verification')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resendEmailVerification(@Request() req: any) {
    await this.identityService.resendEmailVerification(req.user.userId);
    return { success: true, message: 'Verification email sent' };
  }

  @Post('email/verify')
  async verifyEmail(@Body() body: { token: string }) {
    return await this.identityService.verifyEmail(body.token);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async changePassword(
    @Request() req: any,
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    await this.identityService.changePassword(
      req.user.userId,
      body.currentPassword,
      body.newPassword,
    );
    return { success: true, message: 'Password changed successfully' };
  }

  @Get('security-status')
  @UseGuards(JwtAuthGuard)
  async getSecurityStatus(@Request() req: any) {
    return await this.identityService.getSecurityStatus(req.user.userId);
  }

  // ==================== 2FA Management ====================

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  async setup2FA(@Request() req: any) {
    return await this.identityService.setup2FA(req.user.userId);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  async enable2FA(
    @Request() req: any,
    @Body() body: { code: string },
  ) {
    return await this.identityService.enable2FA(req.user.userId, body.code);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  async disable2FA(
    @Request() req: any,
    @Body() body: { code: string; password: string },
  ) {
    return await this.identityService.disable2FA(req.user.userId, body.code, body.password);
  }

  @Post('2fa/verify')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verify2FA(
    @Request() req: any,
    @Body() body: { code: string },
  ) {
    return await this.identityService.verify2FA(req.user.userId, body.code);
  }

  // ==================== Data Export & Account Deletion ====================

  @Get('export')
  @UseGuards(JwtAuthGuard)
  async exportData(@Request() req: any) {
    return await this.identityService.exportUserData(req.user.userId);
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  async deleteAccount(
    @Request() req: any,
    @Body() body: { password: string },
  ) {
    await this.identityService.deleteAccount(req.user.userId, body.password);
    return { success: true, message: 'Account deleted successfully' };
  }
}



