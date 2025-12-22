import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  User,
  OAuthClient,
  Passkey,
  Wallet,
  RefreshToken,
  AuthorizationCode,
} from '../database/entities';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      OAuthClient,
      Passkey,
      Wallet,
      RefreshToken,
      AuthorizationCode,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}



