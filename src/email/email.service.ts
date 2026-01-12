import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as Handlebars from 'handlebars';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { EMAIL_TEMPLATES, EmailTemplateContext } from './email.config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;
  private templatesCache = new Map<string, HandlebarsTemplateDelegate>();

  constructor(private readonly configService: ConfigService) {
    this.initializeTransporter();
    this.precompileTemplates();
  }

  private initializeTransporter() {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpUser = this.configService.get<string>('SMTP_USER');

    // Skip SMTP initialization if no credentials provided
    if (!smtpHost || !smtpUser) {
      this.logger.warn(
        'SMTP credentials not provided. Email functionality will be disabled.',
      );
      return;
    }

    const emailConfig = {
      host: smtpHost,
      port: this.configService.get<number>('SMTP_PORT', 2525),
      secure: false,
      auth: {
        user: smtpUser,
        pass: this.configService.get<string>('SMTP_PASS'),
      },
      tls: {
        rejectUnauthorized: false,
      },
    };

    this.logger.log(
      `SMTP Config: ${JSON.stringify({ ...emailConfig, auth: { user: emailConfig.auth.user, pass: '***' } })}`,
    );

    this.transporter = nodemailer.createTransport(emailConfig);

    // Verify connection
    if (this.transporter) {
      this.transporter.verify((error) => {
        if (error) {
          this.logger.error('SMTP connection failed:', error);
          this.logger.warn('Email functionality may not work properly');
        } else {
          this.logger.log('SMTP server ready');
        }
      });
    }
  }

  private precompileTemplates() {
    const templateNames = [
      'layout',
      'welcome-layout',
      'password-reset-layout',
      'magic-link-layout',
    ];

    templateNames.forEach((templateName) => {
      try {
        // Try dist first (production), then src (development)
        let templatePath = join(__dirname, 'templates', 'email', `${templateName}.hbs`);
        
        // If not found in dist, try src (for development)
        if (!existsSync(templatePath)) {
          const srcPath = join(process.cwd(), 'src', 'email', 'templates', 'email', `${templateName}.hbs`);
          if (existsSync(srcPath)) {
            templatePath = srcPath;
          }
        }
        
        this.logger.log(`Loading template: ${templateName} from ${templatePath}`);
        const templateSource = readFileSync(templatePath, 'utf8');
        const template = Handlebars.compile(templateSource);
        this.templatesCache.set(templateName, template);
        this.logger.log(`✅ Precompiled template: ${templateName}`);
      } catch (error: any) {
        this.logger.error(
          `❌ Failed to precompile template ${templateName}:`,
          error.message,
        );
        this.logger.error(`Template path attempted: ${join(__dirname, 'templates', 'email', `${templateName}.hbs`)}`);
      }
    });

    this.registerHandlebarsHelpers();
    this.registerHandlebarsPartials();
  }

  private registerHandlebarsHelpers() {
    Handlebars.registerHelper('formatDate', (date: Date, format = 'DD.MM.YYYY') => {
      if (!date) return '';
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: format.includes('HH') ? '2-digit' : undefined,
        minute: format.includes('mm') ? '2-digit' : undefined,
      }).format(new Date(date));
    });

    Handlebars.registerHelper('eq', (a, b) => a === b);
    Handlebars.registerHelper('ne', (a, b) => a !== b);
  }

  private registerHandlebarsPartials() {
    const layoutTemplate = this.templatesCache.get('layout');
    if (layoutTemplate) {
      Handlebars.registerPartial('layout', layoutTemplate);
    }

    try {
      // Try dist first (production), then src (development)
      let headerPath = join(__dirname, 'templates', 'email', 'partials', 'header.hbs');
      let footerPath = join(__dirname, 'templates', 'email', 'partials', 'footer.hbs');
      
      // If not found in dist, try src (for development)
      if (!existsSync(headerPath)) {
        const srcHeaderPath = join(process.cwd(), 'src', 'email', 'templates', 'email', 'partials', 'header.hbs');
        const srcFooterPath = join(process.cwd(), 'src', 'email', 'templates', 'email', 'partials', 'footer.hbs');
        if (existsSync(srcHeaderPath)) {
          headerPath = srcHeaderPath;
          footerPath = srcFooterPath;
        }
      }

      const headerSource = readFileSync(headerPath, 'utf8');
      const footerSource = readFileSync(footerPath, 'utf8');

      Handlebars.registerPartial('header', headerSource);
      Handlebars.registerPartial('footer', footerSource);

      this.logger.log('✅ Registered header and footer partials');
    } catch (error: any) {
      this.logger.error('❌ Failed to register partials:', error.message);
    }
  }

  private async sendEmail(data: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn('Email transporter not initialized, skipping send');
      return false;
    }

    try {
      const mailOptions = {
        from: data.from || this.configService.get<string>('SMTP_FROM', 'noreply@inite.ai'),
        to: data.to,
        subject: data.subject,
        html: data.html,
      };

      this.logger.log(`📧 Sending email to ${data.to}`);
      this.logger.log(`📧 Subject: ${data.subject}`);

      const info = await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `✅ Email sent successfully to ${data.to}, messageId: ${info.messageId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${data.to}:`, error);
      return false;
    }
  }

  private async sendTemplatedEmail(
    templateName: string,
    to: string,
    subject: string,
    context: EmailTemplateContext,
  ): Promise<boolean> {
    try {
      const template = this.templatesCache.get(templateName);
      if (!template) {
        this.logger.error(`❌ Template ${templateName} not found in cache`);
        return false;
      }

      const html = template(context);
      return await this.sendEmail({
        to,
        subject,
        html,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send templated email ${templateName} to ${to}:`,
        error,
      );
      return false;
    }
  }

  async sendWelcome(user: { email: string; name?: string }): Promise<boolean> {
    const app = {
      name: 'INITE',
      url: this.configService.get<string>('FRONTEND_URL', 'https://auth.inite.ai'),
      supportEmail: this.configService.get<string>('SUPPORT_EMAIL', 'support@inite.ai'),
    };

    const context = EMAIL_TEMPLATES.welcome.getContext({ user, app });
    return await this.sendTemplatedEmail(
      'welcome-layout',
      user.email,
      'Welcome to INITE',
      context,
    );
  }

  async sendMagicLink(email: string, magicLink: string, name?: string): Promise<boolean> {
    const app = {
      name: 'INITE',
      url: this.configService.get<string>('FRONTEND_URL', 'https://auth.inite.ai'),
      supportEmail: this.configService.get<string>('SUPPORT_EMAIL', 'support@inite.ai'),
    };

    const context = EMAIL_TEMPLATES.magicLink.getContext({
      user: { email, name },
      magicLink,
      app,
    });
    return await this.sendTemplatedEmail(
      'magic-link-layout',
      email,
      'Your INITE Sign-In Link',
      context,
    );
  }

  async sendPasswordReset(
    user: { email: string; name?: string },
    resetUrl: string,
  ): Promise<boolean> {
    const app = {
      name: 'INITE',
      url: this.configService.get<string>('FRONTEND_URL', 'https://auth.inite.ai'),
      supportEmail: this.configService.get<string>('SUPPORT_EMAIL', 'support@inite.ai'),
    };

    const context = EMAIL_TEMPLATES.passwordReset.getContext({
      user,
      resetUrl,
      app,
    });
    return await this.sendTemplatedEmail(
      'password-reset-layout',
      user.email,
      'Reset Your INITE Password',
      context,
    );
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

  async sendEmailChangeVerification(
    newEmail: string,
    oldEmail: string,
    verificationLink: string,
  ): Promise<void> {
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

  async testConnection(): Promise<boolean> {
    if (!this.transporter) {
      return false;
    }
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.error('SMTP connection test failed:', error);
      return false;
    }
  }
}
