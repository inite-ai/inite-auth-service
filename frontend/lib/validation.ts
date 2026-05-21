/**
 * Form validation helpers used by inline auth forms.
 *
 * Regex is intentionally lax — RFC 5322 is unparseable in practice and
 * stricter clients over-reject. The backend always re-validates and
 * delivery acts as ground truth; this is just to catch obvious typos
 * before the user submits.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string): string | null {
  if (!email) return 'Email is required'
  if (email.length > 320) return 'Email is too long'
  if (!EMAIL_RE.test(email)) return 'Enter a valid email address'
  return null
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required'
  if (password.length < 8) return 'Password must be at least 8 characters'
  return null
}
