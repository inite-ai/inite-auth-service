/**
 * The password rules the identity API actually enforces.
 *
 * IdentityAccountService.changePassword rejects anything under 8 characters,
 * without an uppercase letter, or without a digit — but the account form only
 * ever checked length, so a user learned the other two from a 400 after
 * submitting. These predicates are rendered as a live checklist, so the rules
 * are visible before the attempt rather than after it.
 *
 * Keep in sync with src/identity/identity-account.service.ts.
 */

/** i18n keys, resolved by the caller so this stays free of React. */
export type PasswordRuleKey =
  | 'account.password.rule.length'
  | 'account.password.rule.uppercase'
  | 'account.password.rule.number'

export interface PasswordRule {
  key: PasswordRuleKey
  satisfiedBy: (password: string) => boolean
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { key: 'account.password.rule.length', satisfiedBy: (p) => p.length >= 8 },
  { key: 'account.password.rule.uppercase', satisfiedBy: (p) => /[A-Z]/.test(p) },
  { key: 'account.password.rule.number', satisfiedBy: (p) => /[0-9]/.test(p) },
]

/** True when every server-side rule is met. */
export function meetsPasswordRules(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.satisfiedBy(password))
}
