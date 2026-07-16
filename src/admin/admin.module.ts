import { Module, forwardRef } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminClientsService } from './admin-clients.service';
import { ApiKeysAdminController } from './api-keys-admin.controller';
import { SettingsAdminController } from './settings-admin.controller';
import { SettingsAdminService } from './settings-admin.service';
import { OAuthModule } from '../oauth/oauth.module';

@Module({
  imports: [forwardRef(() => OAuthModule)],
  controllers: [AdminController, ApiKeysAdminController, SettingsAdminController],
  providers: [AdminService, AdminClientsService, SettingsAdminService],
  exports: [AdminService],
})
export class AdminModule {}
