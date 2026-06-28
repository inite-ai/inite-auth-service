import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailTransport } from './email-transport.service';

@Module({
  providers: [EmailService, EmailTransport],
  exports: [EmailService],
})
export class EmailModule {}





