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

  async sendEmailVerification(email: string, verificationLink: string): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM');

    await this.transporter.sendMail({
      from,
      to: email,
      subject: 'Verify your INITE email address',
      html: `
        <h1>Verify Your Email</h1>
        <p>Click the link below to verify your email address:</p>
        <p><a href="${verificationLink}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; text-decoration: none; border-radius: 8px;">Verify Email</a></p>
        <p>Or copy this link: <a href="${verificationLink}">${verificationLink}</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't request this, you can safely ignore this email.</p>
      `,
    });
  }

  async sendEmailChangeVerification(newEmail: string, oldEmail: string, verificationLink: string): Promise<void> {
    const from = this.configService.get<string>('SMTP_FROM');

    await this.transporter.sendMail({
      from,
      to: newEmail,
      subject: 'Confirm your new INITE email address',
      html: `
        <h1>Confirm Email Change</h1>
        <p>You requested to change your INITE email from <strong>${oldEmail}</strong> to <strong>${newEmail}</strong>.</p>
        <p>Click the link below to confirm this change:</p>
        <p><a href="${verificationLink}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; text-decoration: none; border-radius: 8px;">Confirm Email Change</a></p>
        <p>Or copy this link: <a href="${verificationLink}">${verificationLink}</a></p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't request this change, please secure your account immediately.</p>
      `,
    });
  }
}



