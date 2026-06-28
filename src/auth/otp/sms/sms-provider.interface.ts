/**
 * Pluggable SMS transport. Implementations send a short text body to an E.164
 * phone number. `enabled` reflects whether the provider has the credentials it
 * needs — when false the OTP service refuses the SMS channel with a clear error
 * rather than silently dropping codes.
 */
export interface SmsProvider {
  readonly name: string;
  readonly enabled: boolean;
  send(to: string, body: string): Promise<boolean>;
}

/** DI token for the active SmsProvider implementation. */
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
