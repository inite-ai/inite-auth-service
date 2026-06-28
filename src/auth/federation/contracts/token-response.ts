/** Token-endpoint response (only the fields we consume). */
export interface TokenResponse {
  access_token: string;
  token_type?: string;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}
