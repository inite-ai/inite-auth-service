import { IsDefined } from 'class-validator';

/**
 * Body for the WebAuthn verify endpoints:
 *   - POST /v1/auth/passkey/registration/verify
 *   - POST /v1/auth/passkey/authentication/verify
 *
 * `response` is the raw SimpleWebAuthn attestation/assertion object. It is
 * kept deliberately permissive — SimpleWebAuthn performs the real structural
 * and cryptographic validation server-side. Deep-validating here would risk
 * rejecting valid ceremonies as authenticators/browsers evolve. Any embedded
 * challenge is ignored by the controller (the expected challenge is read from
 * Redis), so no top-level challenge field is declared.
 */
export class PasskeyResponseDto {
  @IsDefined()
  response!: Record<string, unknown>;
}
