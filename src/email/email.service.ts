import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_TEMPLATES } from './email.config';
import { EmailTransport } from './email-transport.service';

/**
 * Per-message email helpers (welcome, magic-link, OTP, security notices…).
 * The SMTP transport + Handlebars engine live in EmailTransport; these methods
 * build the per-template context and delegate the actual send.
 */
@Injectable()
export class EmailService {
  constructor(
    private readonly configService: ConfigService,
    private readonly transport: EmailTransport,
  ) {}

  /** SMTP reachability probe (used by the health check). */
  testConnection(): Promise<boolean> {
    return this.transport.testConnection();
  }

  async sendWelcome(user: { email: string; name?: string }): Promise<boolean> {
    const app = {
      name: 'INITE',
      url: this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000'),
      supportEmail: this.configService.get<string>('SUPPORT_EMAIL', 'support@example.com'),
    };

    const context = EMAIL_TEMPLATES.welcome.getContext({ user, app });
    return await this.transport.sendTemplatedEmail({
      templateName: 'welcome-layout',
      to: user.email,
      subject: '[INITE] Welcome — your account has been created',
      context,
    });
  }

  async sendMagicLink(email: string, magicLink: string, name?: string): Promise<boolean> {
    const app = {
      name: 'INITE',
      url: this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000'),
      supportEmail: this.configService.get<string>('SUPPORT_EMAIL', 'support@example.com'),
    };

    const context = EMAIL_TEMPLATES.magicLink.getContext({
      user: { email, name },
      magicLink,
      app,
    });
    return await this.transport.sendTemplatedEmail({
      templateName: 'magic-link-layout',
      to: email,
      subject: '[INITE] Your sign-in link',
      context,
    });
  }

  /**
   * One-time passcode (OTP) email. Inline HTML rather than a Handlebars layout
   * — the body is a single prominent code, so the template machinery would be
   * overkill. `ttlMinutes` is surfaced so the recipient knows the window.
   */
  async sendOtpCode(
    email: string,
    code: string,
    opts: { ttlMinutes: number; name?: string } = { ttlMinutes: 10 },
  ): Promise<boolean> {
    const greeting = opts.name ? `Hi ${opts.name},` : 'Hi,';
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
        <p style="font-size:14px;color:#334155">${greeting}</p>
        <p style="font-size:14px;color:#334155">Use this code to continue signing in to INITE:</p>
        <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:16px;margin:16px 0;background:#f1f5f9;border-radius:8px">${code}</div>
        <p style="font-size:13px;color:#64748b">This code expires in ${opts.ttlMinutes} minutes. If you didn't request it, you can safely ignore this email — someone may have mistyped their address.</p>
      </div>`;
    return await this.transport.sendEmail({
      to: email,
      subject: `[INITE] Your verification code: ${code}`,
      html,
    });
  }

  async sendNewDeviceLogin(
    user: { email: string; name?: string },
    deviceInfo?: string,
  ): Promise<boolean> {
    const app = {
      name: 'INITE',
      url: this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000'),
      supportEmail: this.configService.get<string>('SUPPORT_EMAIL', 'support@example.com'),
    };

    const context = EMAIL_TEMPLATES.newDeviceLogin.getContext({ user, app, deviceInfo });
    return await this.transport.sendTemplatedEmail({
      templateName: 'new-device-layout',
      to: user.email,
      subject: '[INITE] Sign-in from new device',
      context,
    });
  }

  async sendPasswordReset(
    user: { email: string; name?: string },
    resetUrl: string,
  ): Promise<boolean> {
    const app = {
      name: 'INITE',
      url: this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000'),
      supportEmail: this.configService.get<string>('SUPPORT_EMAIL', 'support@example.com'),
    };

    const context = EMAIL_TEMPLATES.passwordReset.getContext({
      user,
      resetUrl,
      app,
    });
    return await this.transport.sendTemplatedEmail({
      templateName: 'password-reset-layout',
      to: user.email,
      subject: '[INITE] Reset your password',
      context,
    });
  }

  async sendEmailVerification(email: string, verificationLink: string): Promise<boolean> {
    return await this.transport.sendEmail({
      to: email,
      subject: '[INITE] Verify your email',
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

  async sendEmailChangeVerification(
    newEmail: string,
    oldEmail: string,
    verificationLink: string,
  ): Promise<boolean> {
    return await this.transport.sendEmail({
      to: newEmail,
      subject: '[INITE] Confirm your new email',
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

  /**
   * Security: notify on password change. The "if this wasn't you,
   * reset your password" link is the canonical compromise-recovery
   * surface — without it, a successful credential-stuffer holds the
   * account silently.
   */
  async sendPasswordChanged(user: {
    email: string;
    name?: string;
  }): Promise<boolean> {
    const frontend = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const resetUrl = `${frontend}/forgot-password`;
    return await this.transport.sendEmail({
      to: user.email,
      subject: '[INITE] Your password was changed',
      html: `
        <h1>Password Changed</h1>
        <p>Hi${user.name ? ` ${user.name}` : ''},</p>
        <p>Your INITE account password was just changed.</p>
        <p>If this was you — no action needed.</p>
        <p><strong>If this wasn't you</strong>, your account may be compromised. Reset your password immediately:</p>
        <p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; text-decoration: none; border-radius: 8px;">Reset password</a></p>
        <p>Or open <a href="${resetUrl}">${resetUrl}</a>.</p>
      `,
    });
  }

  /**
   * Security: notify after N consecutive failed login attempts but
   * before lockout. Gives the user a chance to react (change a leaked
   * password, enable 2FA) before the next attempt actually succeeds.
   */
  async sendFailedLoginThreshold(
    user: { email: string; name?: string },
    attemptCount: number,
  ): Promise<boolean> {
    const frontend = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    return await this.transport.sendEmail({
      to: user.email,
      subject: '[INITE] Multiple failed sign-in attempts',
      html: `
        <h1>Failed Sign-In Attempts Detected</h1>
        <p>Hi${user.name ? ` ${user.name}` : ''},</p>
        <p>We detected <strong>${attemptCount} failed sign-in attempts</strong> to your INITE account in the last few minutes.</p>
        <p>If this was you — try the <a href="${frontend}/forgot-password">password reset</a> flow.</p>
        <p><strong>If this wasn't you</strong>, someone is trying to access your account. Consider:</p>
        <ul>
          <li>Changing your password to something unique</li>
          <li>Enabling 2FA in your account security settings</li>
          <li>Adding a passkey for phishing-resistant sign-in</li>
        </ul>
        <p><a href="${frontend}/account">Review your account security</a></p>
      `,
    });
  }

  /**
   * Security: notify when an account is locked out. The user sees
   * "your account is locked" in the UI, but the email gives them the
   * unlock path (password reset) without contacting support.
   */
  async sendAccountLocked(
    user: { email: string; name?: string },
    lockedUntil: Date,
  ): Promise<boolean> {
    const frontend = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const resetUrl = `${frontend}/forgot-password`;
    return await this.transport.sendEmail({
      to: user.email,
      subject: '[INITE] Your account has been temporarily locked',
      html: `
        <h1>Account Locked</h1>
        <p>Hi${user.name ? ` ${user.name}` : ''},</p>
        <p>Your INITE account has been temporarily locked because of too many failed sign-in attempts. The lock will lift automatically at <strong>${lockedUntil.toUTCString()}</strong>.</p>
        <p>If you forgot your password, reset it now and you'll be back in:</p>
        <p><a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background: linear-gradient(135deg, #8b5cf6, #ec4899); color: white; text-decoration: none; border-radius: 8px;">Reset password</a></p>
        <p><strong>If you didn't try to sign in</strong>, someone else is attempting to access your account. Reset your password as a precaution.</p>
      `,
    });
  }

  /**
   * Security: notify when the user grants an OAuth client access to
   * their account for the first time. Audit-trail surface for the
   * user — "what apps did I authorize?" — without requiring them to
   * dig through the admin panel.
   */
  async sendOAuthConsentGranted(
    user: { email: string; name?: string },
    clientName: string,
    scopes: string[],
  ): Promise<boolean> {
    const frontend = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const scopeList = scopes.length
      ? `<ul>${scopes.map((s) => `<li><code>${s}</code></li>`).join('')}</ul>`
      : '<p><em>(no scopes requested)</em></p>';
    return await this.transport.sendEmail({
      to: user.email,
      subject: `[INITE] You authorized ${clientName}`,
      html: `
        <h1>App Authorization Granted</h1>
        <p>Hi${user.name ? ` ${user.name}` : ''},</p>
        <p>You just authorized <strong>${clientName}</strong> to access your INITE account with these permissions:</p>
        ${scopeList}
        <p>You can revoke this access at any time from your <a href="${frontend}/account">account security settings</a>.</p>
        <p>If you didn't authorize this app, sign in and revoke the grant immediately, then change your password.</p>
      `,
    });
  }

}
