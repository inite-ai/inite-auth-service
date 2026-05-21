/**
 * Translation dictionary type and the English source-of-truth.
 *
 * Keys are flat dotted paths grouped by feature area. Add new keys
 * only in this file — other locales (`ru.ts` etc.) `Partial<Dict>`
 * the same shape, with missing keys falling back to English at
 * runtime.
 *
 * Why a single dotted-key flat dict instead of a nested tree:
 * - Auto-completes in TS as union of literals.
 * - Easier to grep ("who uses 'auth.signIn.button'?") than nested.
 * - Translators see the path → can guess context without code.
 */

export const en = {
  // Common controls
  'common.signIn': 'Sign in',
  'common.signOut': 'Sign out',
  'common.signUp': 'Sign up',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.continue': 'Continue',
  'common.loading': 'Loading…',
  'common.email': 'Email',
  'common.password': 'Password',
  'common.name': 'Name',

  // Sign-in / sign-up screens
  'auth.welcome.title': 'Sign in to INITE',
  'auth.welcome.subtitle': 'Choose how you want to sign in',
  'auth.method.passkey': 'Passkey',
  'auth.method.passkey.hint': 'Use Touch ID, Face ID, or a security key',
  'auth.method.magic': 'Magic link',
  'auth.method.magic.hint': 'We email you a sign-in link',
  'auth.method.password': 'Password',
  'auth.method.password.hint': 'Classic email and password',
  'auth.recommended': 'Recommended',

  // Password form
  'auth.password.title.login': 'Sign in with Password',
  'auth.password.title.register': 'Create Account',
  'auth.password.subtitle.login': 'Use your email and password',
  'auth.password.subtitle.register': 'Register with email and password',
  'auth.password.cta.login': 'Sign In',
  'auth.password.cta.register': 'Create Account',
  'auth.password.cta.loading.login': 'Signing in…',
  'auth.password.cta.loading.register': 'Creating account…',
  'auth.password.switch.toRegister': "Don't have an account? Sign up",
  'auth.password.switch.toLogin': 'Already have an account? Sign in',
  'auth.password.warning':
    'Password authentication is provided for backward compatibility. We recommend using Passkey for better security.',
  'auth.password.success.login': 'Logged in successfully!',
  'auth.password.success.register': 'Account created!',
  'auth.password.error.breached':
    'This password appears in {count} known data breaches. Pick a unique one.',
  'auth.password.error.generic': 'Authentication failed',
  'auth.password.error.fillFields': 'Please fill in all fields',

  // Magic link form
  'auth.magic.title': 'Sign in with Email',
  'auth.magic.subtitle': "We'll send you a magic link to sign in",
  'auth.magic.cta.send': 'Send Magic Link',
  'auth.magic.cta.sending': 'Sending…',
  'auth.magic.sent.title': 'Check your email',
  'auth.magic.sent.subtitle': "We've sent a magic link to",
  'auth.magic.sent.expiry':
    'The link will expire in 15 minutes. Make sure to check your spam folder.',
  'auth.magic.sent.useDifferent': 'Use a different email',
  'auth.magic.howItWorks.title': 'How it works',
  'auth.magic.howItWorks.1': 'Enter your email address',
  'auth.magic.howItWorks.2': 'Check your inbox for the magic link',
  'auth.magic.howItWorks.3': 'Click the link to sign in instantly',
  'auth.magic.howItWorks.4': 'No password required!',
  'auth.magic.error.generic': 'Failed to send magic link',
  'auth.magic.success': 'Magic link sent! Check your email',

  // Passkey form
  'auth.passkey.title.login': 'Sign in with Passkey',
  'auth.passkey.title.register': 'Register Passkey',
  'auth.passkey.subtitle.login': 'Use your fingerprint, face, or security key',
  'auth.passkey.subtitle.register':
    'Create a new passkey for passwordless login',
  'auth.passkey.cta.authenticate': 'Authenticate',
  'auth.passkey.cta.authenticating': 'Authenticating…',
  'auth.passkey.cta.register': 'Register Passkey',
  'auth.passkey.cta.registering': 'Registering…',
  'auth.passkey.switch.toRegister': "Don't have a passkey? Register one",
  'auth.passkey.switch.toLogin': 'Already have a passkey? Sign in',
  'auth.passkey.mostSecure': 'Most Secure Option',
  'auth.passkey.mostSecureHint':
    "Passkeys are phishing-resistant and don't require passwords.",

  // Validation
  'validation.email.required': 'Email is required',
  'validation.email.invalid': 'Enter a valid email address',
  'validation.email.tooLong': 'Email is too long',
  'validation.password.required': 'Password is required',
  'validation.password.tooShort': 'Password must be at least 8 characters',

  // Errors / generic
  'error.network': 'Network error — please try again',
  'error.rateLimit': "You're trying that too often. Wait a moment.",

  // Account / security audit
  'account.security.activity.title': 'Recent activity',
  'account.security.activity.subtitle':
    'Last 20 security-relevant events on your account',
  'account.security.activity.empty': 'No activity yet.',
} as const

/**
 * Project EN's literal-string values to plain `string` so other locales
 * (Partial<Dict>) can legally hold their own translations rather than
 * being required to equal the English literal.
 */
export type Dict = { readonly [K in keyof typeof en]: string }
export type TKey = keyof Dict
