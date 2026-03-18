export interface OAuthParamsDto {
  clientId?: string;
  redirectUri?: string;
  scope?: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
}
