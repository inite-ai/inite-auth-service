export interface EmailUser {
  name?: string;
  email: string;
}

export interface EmailApp {
  name: string;
  url: string;
  supportEmail: string;
  logoUrl?: string;
}

/** Nested, template-specific i18n strings — shape varies per template. */
export type EmailTranslations = Record<string, unknown>;

export interface EmailTemplateContext {
  user?: EmailUser;
  app: EmailApp;
  translations: EmailTranslations;
  resetUrl?: string;
  magicLink?: string;
  headerGradient?: string;
  headerIcon?: string;
}

export interface EmailTemplateConfig {
  templateName: string;
  getContext: (params: EmailTemplateParams) => EmailTemplateContext;
}

/** Union of the per-template context inputs accepted by getContext(). */
export type EmailTemplateParams =
  | { user: EmailUser; app: EmailApp }
  | { user: EmailUser; resetUrl: string; app: EmailApp }
  | { user: EmailUser; magicLink: string; app: EmailApp }
  | { user: EmailUser; app: EmailApp; deviceInfo?: string };

export const EMAIL_TEMPLATES = {
  welcome: {
    templateName: 'welcome-layout',
    getContext: (params: { user: EmailUser; app: EmailApp }) => ({
      user: params.user,
      app: params.app,
      translations: {
        title: 'Welcome to INITE',
        greeting: `Hello ${params.user.name || params.user.email}!`,
        message: 'Welcome to INITE! Your decentralized identity is now ready.',
        features: {
          intro: 'With INITE, you can:',
          securityTitle: 'Secure Identity',
          securityDesc: 'Your identity is protected with decentralized technology',
          ecosystemTitle: 'Ecosystem Access',
          ecosystemDesc: 'Access all INITE services with single sign-on',
          passkeyTitle: 'Passwordless Auth',
          passkeyDesc: 'Set up passkeys for secure, passwordless login',
        },
        cta: {
          button: 'Get Started',
          text: 'Start exploring the INITE ecosystem',
        },
        footer: {
          copyright: '© 2024 INITE. All rights reserved.',
          questions: 'Questions? Contact us at ',
          privacy: 'Privacy Policy',
          terms: 'Terms of Service',
          automated: 'This is an automated message, please do not reply.',
        },
      },
      headerGradient: 'linear-gradient(135deg, #38a169 0%, #2f855a 100%)',
      headerIcon: '🎉',
    }),
  },
  passwordReset: {
    templateName: 'password-reset-layout',
    getContext: (params: {
      user: EmailUser;
      resetUrl: string;
      app: EmailApp;
    }) => ({
      user: params.user,
      resetUrl: params.resetUrl,
      app: params.app,
      translations: {
        title: 'Reset Your Password',
        message: `Hello ${params.user.name || params.user.email},`,
        instructions: 'You requested to reset your password. Click the button below to create a new password:',
        button: 'Reset Password',
        expiry: 'This link will expire in 1 hour.',
        security: 'If you did not request this, please ignore this email or contact support if you have concerns.',
        footer: {
          copyright: '© 2024 INITE. All rights reserved.',
          questions: 'Questions? Contact us at ',
          privacy: 'Privacy Policy',
          terms: 'Terms of Service',
          automated: 'This is an automated message, please do not reply.',
        },
      },
      headerGradient: 'linear-gradient(135deg, #e53e3e 0%, #c53030 100%)',
      headerIcon: '🔒',
    }),
  },
  magicLink: {
    templateName: 'magic-link-layout',
    getContext: (params: {
      user: EmailUser;
      magicLink: string;
      app: EmailApp;
    }) => ({
      user: params.user,
      magicLink: params.magicLink,
      app: params.app,
      translations: {
        title: 'Sign in to INITE',
        message: `Hello ${params.user.name || params.user.email},<br><br>Click the button below to sign in to your INITE account:`,
        button: 'Sign In',
        expiry: 'This link will expire in 15 minutes.',
        security: 'If you did not request this, please ignore this email or contact support if you have concerns.',
        footer: {
          copyright: '© 2024 INITE. All rights reserved.',
          questions: 'Questions? Contact us at ',
          privacy: 'Privacy Policy',
          terms: 'Terms of Service',
          automated: 'This is an automated message, please do not reply.',
        },
      },
      headerGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      headerIcon: '🔗',
    }),
  },
  newDeviceLogin: {
    templateName: 'new-device-layout',
    getContext: (params: { user: EmailUser; app: EmailApp; deviceInfo?: string }) => ({
      user: params.user,
      app: params.app,
      deviceInfo: params.deviceInfo || 'new device or browser',
      translations: {
        title: 'Sign-in from new device',
        message: `Hello, ${params.user.name || params.user.email}!`,
        description: 'We detected a sign-in to your INITE account from a device or browser you haven\'t used before.',
        deviceLabel: 'Device:',
        warning: 'If this wasn\'t you, we recommend changing your password in security settings.',
        footer: {
          copyright: '© 2024 INITE. All rights reserved.',
          questions: 'Questions? Contact us at ',
          automated: 'This is an automated message, please do not reply.',
        },
      },
      headerGradient: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
      headerIcon: '📱',
    }),
  },
};
