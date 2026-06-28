import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    /// AMR (RFC 8176) values captured at login so id_tokens minted
    /// from this session advertise the authentication strength back
    /// to the RP. Examples: ['pwd'], ['pwd','otp'], ['fido'],
    /// ['magic-link'].
    amr?: string[];
    /// ACR (Authentication Context Class Reference) — set if the
    /// /authorize request asked for a specific level and the user
    /// satisfied it. Surfaced on id_token.acr.
    acr?: string;
    oauthParams?: {
      clientId: string;
      redirectUri: string;
      scope?: string;
      state?: string;
      codeChallenge: string;
      codeChallengeMethod: string;
      nonce?: string;
    };
  }
}



