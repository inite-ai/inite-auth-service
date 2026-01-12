export interface EmailTemplateContext {
  user?: {
    name?: string;
    email: string;
  };
  app: {
    name: string;
    url: string;
    supportEmail: string;
    logoUrl?: string;
  };
  translations: Record<string, any>;
  resetUrl?: string;
  magicLink?: string;
  headerGradient?: string;
  headerIcon?: string;
}

export interface EmailTemplateConfig {
  templateName: string;
  getContext: (params: any) => EmailTemplateContext;
}

export const EMAIL_TEMPLATES = {
  welcome: {
    templateName: 'welcome-layout',
    getContext: (params: { user: any; app: any }) => ({
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
      user: any;
      resetUrl: string;
      app: any;
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
      user: any;
      magicLink: string;
      app: any;
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
};
