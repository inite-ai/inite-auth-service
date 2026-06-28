import { Module, forwardRef } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminClientsService } from './admin-clients.service';
import { OAuthModule } from '../oauth/oauth.module';

@Module({
  imports: [forwardRef(() => OAuthModule)],
  controllers: [AdminController],
  providers: [AdminService, AdminClientsService],
  exports: [AdminService],
})
export class AdminModule {}
