import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    oauthParams?: {
      clientId: string;
      redirectUri: string;
      scope?: string;
      state?: string;
      codeChallenge: string;
      codeChallengeMethod: string;
    };
  }
}

