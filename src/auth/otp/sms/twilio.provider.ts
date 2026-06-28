import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../common/logger.service';
import { SmsProvider } from './sms-provider.interface';

/**
 * Twilio SMS provider. Calls the REST Messages API directly via fetch — no SDK
 * dependency. Activates only when TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and
 * TWILIO_FROM are all set; otherwise `enabled` is false and the OTP service
 * rejects the SMS channel up front.
 */
@Injectable()
export class TwilioSmsProvider implements SmsProvider {
  readonly name = 'twilio';
  private readonly logger = new LoggerService();
  private readonly accountSid?: string;
  private readonly authToken?: string;
  private readonly from?: string;

  constructor(private readonly config: ConfigService) {
    this.logger.setContext('TwilioSmsProvider');
    this.accountSid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    this.authToken = this.config.get<string>('TWILIO_AUTH_TOKEN');
    this.from = this.config.get<string>('TWILIO_FROM');
  }

  get enabled(): boolean {
    return !!(this.accountSid && this.authToken && this.from);
  }

  async send(to: string, body: string): Promise<boolean> {
    if (!this.enabled) return false;
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
      'base64',
    );
    const form = new URLSearchParams({ To: to, From: this.from as string, Body: body });

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.error('Twilio send failed', `HTTP ${res.status} ${text}`.slice(0, 200));
        return false;
      }
      return true;
    } catch (err) {
      this.logger.error('Twilio send error', (err as Error)?.message ?? 'unknown');
      return false;
    }
  }
}
