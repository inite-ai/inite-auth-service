import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OAuthAuditService } from './oauth-audit.service';

/**
 * Global so OAuth, admin, and identity modules can inject the audit
 * service without re-declaring the import each time.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [OAuthAuditService],
  exports: [OAuthAuditService],
})
export class AuditModule {}
