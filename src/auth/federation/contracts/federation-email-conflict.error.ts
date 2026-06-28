/**
 * Raised when a federated identity's email matches an existing local account
 * but the provider did NOT assert the email as verified. Auto-linking there
 * would let anyone who can set that (unverified) email at the IdP take over the
 * local account, so we refuse and require the user to sign in and link
 * manually. The controller surfaces this as a redirect with an error code.
 */
export class FederationEmailConflictError extends Error {
  constructor(public readonly email: string) {
    super(
      `An account already exists for ${email}. Sign in and link this provider ` +
        `from account settings instead.`,
    );
    this.name = 'FederationEmailConflictError';
  }
}
