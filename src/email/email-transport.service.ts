import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import * as Handlebars from "handlebars";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { EmailTemplateContext } from "./email.config";

export interface SendTemplatedEmailInput {
  templateName: string;
  to: string;
  subject: string;
  context: EmailTemplateContext;
}

/**
 * SMTP transport + Handlebars template engine for outbound mail. Split out of
 * EmailService so the per-message send* helpers (which stay in EmailService)
 * and this transport machinery each stay within the size gate.
 */
@Injectable()
export class EmailTransport {
  private readonly logger = new Logger(EmailTransport.name);
  // Optional: left undefined when SMTP credentials are absent, so callers must
  // guard before sending (email is treated as best-effort, never a hard fail).
  private transporter?: nodemailer.Transporter;
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
        rejectUnauthorized: this.configService.get<string>('NODE_ENV') === 'production',
      },
    };

    this.logger.log(
      `SMTP Config: ${JSON.stringify({ ...emailConfig, auth: { user: emailConfig.auth.user, pass: '***' } })}`,
    );

    this.transporter = nodemailer.createTransport(emailConfig);

    this.logger.log(`Sender: ${this.getFromAddress()}`);

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
      'new-device-layout',
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
      } catch (error: unknown) {
        this.logger.error(
          `❌ Failed to precompile template ${templateName}:`,
          error instanceof Error ? error.message : String(error),
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
    } catch (error: unknown) {
      this.logger.error(
        '❌ Failed to register partials:',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /** From header: "INITE Auth" <email> so inbox shows "INITE Auth" as sender name */
  private getFromAddress(): string {
    const raw = this.configService.get<string>('SMTP_FROM', 'noreply@example.com');
    const email = raw.includes('@') ? raw : 'noreply@example.com';
    return `"INITE Auth" <${email}>`;
  }

  async sendEmail(data: {
    to: string;
    subject: string;
    html: string;
    from?: string;
  }): Promise<boolean> {
    const transporter = this.transporter;
    if (!transporter) {
      this.logger.warn('Email transporter not initialized, skipping send');
      return false;
    }

    try {
      const mailOptions = {
        from: data.from || this.getFromAddress(),
        to: data.to,
        subject: data.subject,
        html: data.html,
      };

      this.logger.log(`📧 Sending email to ${data.to}`);
      this.logger.log(`📧 Subject: ${data.subject}`);

      const info = await transporter.sendMail(mailOptions);
      this.logger.log(
        `✅ Email sent successfully to ${data.to}, messageId: ${info.messageId}`,
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${data.to}:`, error);
      return false;
    }
  }

  async sendTemplatedEmail(
    input: SendTemplatedEmailInput,
  ): Promise<boolean> {
    const { templateName, to, subject, context } = input;
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

  async testConnection(): Promise<boolean> {
    const transporter = this.transporter;
    if (!transporter) {
      return false;
    }
    try {
      await transporter.verify();
      return true;
    } catch (error) {
      this.logger.error('SMTP connection test failed:', error);
      return false;
    }
  }
}
