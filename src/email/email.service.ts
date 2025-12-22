import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('SMTP_HOST'),
      port: this.configService.get<number>('SMTP_PORT'),
      secure: this.configService.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: this.configService.get<string>('SMTP_USER'),
        pass: this.configService.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendMagicLink(email: string, magicLink: string): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM');

    await this.transporter.sendMail({
      from,
      to: email,
      subject: 'Your INITE Sign-In Link',
      html: `
        <h1>Sign in to INITE</h1>
        <p>Click the link below to sign in to your INITE account:</p>
        <p><a href="${magicLink}">${magicLink}</a></p>
        <p>This link will expire in 15 minutes.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });
  }

  async sendWelcome(email: string, name: string): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM');

    await this.transporter.sendMail({
      from,
      to: email,
      subject: 'Welcome to INITE',
      html: `
        <h1>Welcome to INITE, ${name}!</h1>
        <p>Your identity is now secured with decentralized technology.</p>
        <p>You can now access all INITE ecosystem services with a single sign-on.</p>
        <ul>
          <li><strong>Break³</strong> - Health challenges and wellness</li>
          <li><strong>INITE Club</strong> - Premium community access</li>
          <li><strong>INITE Health</strong> - Healthcare services</li>
          <li><strong>INITE Events</strong> - Event management</li>
        </ul>
        <p>Get started by setting up a passkey for secure, passwordless authentication.</p>
      `,
    });
  }
}



