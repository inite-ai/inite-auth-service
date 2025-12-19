import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { IdentityService } from './identity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('identity')
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
    },
  ) {
    return await this.identityService.linkWallet(
      req.user.userId,
      body.address,
      body.chain,
      body.message,
      body.signature,
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
}


