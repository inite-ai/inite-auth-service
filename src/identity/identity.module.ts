import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityService } from './identity.service';
import { DidService } from './did.service';
import { IdentityController } from './identity.controller';
import { User, Wallet } from '../database/entities';

@Module({
  imports: [TypeOrmModule.forFeature([User, Wallet])],
  providers: [IdentityService, DidService],
  controllers: [IdentityController],
  exports: [IdentityService, DidService],
})
export class IdentityModule {}


