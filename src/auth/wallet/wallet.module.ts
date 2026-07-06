import { Module } from '@nestjs/common';
import { AuthModule } from '../auth.module';
import { IdentityModule } from '../../identity/identity.module';
import { WalletAuthService } from './wallet-auth.service';
import { WalletAuthController } from './wallet-auth.controller';

/**
 * Sign-In With Ethereum (EIP-4361) LOGIN factor. AuthModule is imported for
 * AuthService (token issuance); IdentityModule for JIT identity creation of
 * wallet-only accounts. RedisService comes from the global CommonModule.
 */
@Module({
  imports: [AuthModule, IdentityModule],
  providers: [WalletAuthService],
  controllers: [WalletAuthController],
  exports: [WalletAuthService],
})
export class WalletModule {}
