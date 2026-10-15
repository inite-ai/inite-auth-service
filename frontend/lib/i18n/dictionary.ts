import { enAccount } from './account/en'
import { enWallet } from './wallet/en'

/**
 * Translation dictionary type and the English source-of-truth.
 *
 * Keys are flat dotted paths grouped by feature area. Add new keys
 * only in this file (or `account/en.ts` for the account area) — other locales (`ru.ts` etc.) `Partial<Dict>`
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
  'common.account': 'Account',
  'common.admin': 'Admin',

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
  'auth.method.otp': 'Email code',
  'auth.method.otp.hint': 'Get a 6-digit one-time code by email',
  'auth.method.wallet': 'Ethereum wallet',
  'auth.method.wallet.hint': 'Sign in with your Web3 wallet',

  // Sign-in / sign-up landing (method picker)
  'auth.hero.login.subtitle': 'Pick how you want to sign in.',
  'auth.hero.register.title': 'Create your INITE account',
  'auth.hero.register.subtitle':
    'Pick how you want to register — you can add more methods later.',
  'auth.hero.forClient': 'for',
  'auth.stepUp.notice':
    'This app needs a higher security level. Please re-authenticate with a passkey or a second factor to continue.',
  'auth.stepUp.otherMethod': 'Use another sign-in method',
  'auth.allMethods': 'All methods',
  'auth.switch.haveAccount': 'Already have an account?',
  'auth.switch.signIn': 'Sign in',
  'auth.switch.noAccount': "Don't have an account?",
  'auth.switch.create': 'Create one',
  'auth.legal.prefix': "By continuing, you agree to INITE's",
  'auth.legal.terms': 'Terms of Service',
  'auth.legal.and': 'and',
  'auth.legal.privacy': 'Privacy Policy',

  // Email one-time code
  'auth.otp.title.request': 'Sign in with a code',
  'auth.otp.title.verify': 'Enter your code',
  'auth.otp.subtitle.request': 'We’ll email you a 6-digit one-time code.',
  'auth.otp.subtitle.verify': 'We sent a 6-digit code to {email}.',
  'auth.otp.field.email': 'Email address',
  'auth.otp.field.code': '6-digit code',
  'auth.otp.cta.send': 'Send code',
  'auth.otp.cta.sending': 'Sending…',
  'auth.otp.cta.verify': 'Verify & sign in',
  'auth.otp.cta.verifying': 'Verifying…',
  'auth.otp.useDifferent': 'Use a different email',
  'auth.otp.sent': 'Code sent — check your email',
  'auth.otp.success': 'Signed in',
  'auth.otp.error.send': 'Could not send a code',
  'auth.otp.error.format': 'Enter the 6-digit code',
  'auth.otp.error.invalid': 'Invalid or expired code',

  // Social sign-in
  'auth.social.or': 'or continue with',
  'auth.social.error.emailConflict':
    'An account already exists for that email. Sign in with your existing method, then link this provider from account settings.',
  'auth.social.error.failed': 'Social sign-in failed. Please try again.',

  // OAuth consent screen
  'consent.header': 'Authorize app',
  'consent.title': 'Confirm sign-in',
  'consent.wantsAccess': 'wants to access your account',
  'consent.user': 'User',
  'consent.switchAccount': 'Use another account',
  'consent.permissions': 'This will allow the app to:',
  'consent.wallet.title': 'Pay from your INITE wallet',
  'consent.wallet.perPayment': 'Up to ${amount} per payment',
  'consent.wallet.daily': 'Up to ${amount} a day',
  'consent.wallet.monthly': 'Up to ${amount} a month',
  'consent.wallet.merchants': 'Only on: {sites}',
  'consent.wallet.anywhere': 'On any site that accepts USDC on Base',
  'consent.wallet.note': 'Payments are in USDC on Base. You approve this with your passkey; you can change the limits or disconnect the app in your INITE ID account at any time.',
  'consent.allow': 'Allow',
  'consent.allowing': 'Authorizing…',
  'consent.footer':
    'By clicking Allow, you authorize this app to use your information in accordance with their terms.',
  'consent.error.title': 'Authorization error',
  'consent.privacy': 'Privacy Policy',
  'consent.terms': 'Terms of Service',
  'consent.scope.openid': 'Verify your identity',
  'consent.scope.profile': 'Access your name and avatar',
  'consent.scope.email': 'View your email address',
  'consent.scope.admin': 'Administrative access',
  'consent.scope.offline_access': 'Stay signed in with refresh tokens',
  'consent.scope.brain:read': 'Search and read your memory (brain)',
  'consent.scope.brain:write': 'Record facts into your memory (brain)',
  'consent.scope.brain:admin': 'Operate your memory tenant (brain)',
  'consent.scope.brain:read_pii': 'Read personally identifiable memory fields',
  'consent.scope.mikefluff:purchase': 'Start buying books on mikefluff.com for you (you still confirm the payment)',
  'consent.scope.mikefluff:booking': 'Book calls with Mike Fluff in your name, with your name and email',
  'consent.scope.wallet:pay': 'Pay from your INITE wallet within the limits below, approved with your passkey',
  'consent.scope.other': 'Use the permission “{scope}”',
  'device.header': 'Authorize device',
  'device.title': 'Authorize a device or agent',
  'device.prompt': 'Enter the code shown by your device, command line or AI agent.',
  'device.continue': 'Continue',
  'device.enterCode': 'Enter the code shown on your device',
  'device.notFound': 'Code not found or expired',
  'device.approvalFailed': 'Approval failed',
  'device.signIn.title': 'Sign in to continue',
  'device.signIn.body': 'You need to be signed in to approve a device.',
  'device.wants': 'wants to sign in to your account',
  'device.permissions': 'If you approve, it will be able to:',
  'device.resource': 'Only for use at {resource}',
  'device.deny': 'Deny',
  'device.approve': 'Approve',
  'device.approved.title': 'Device approved',
  'device.approved.body': 'You can close this tab. The device will finish signing in shortly.',
  'device.denied.title': 'Device denied',
  'device.denied.body': 'You denied this device. It will not receive access.',

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

  ...enAccount,
  ...enWallet,
} as const

/**
 * Project EN's literal-string values to plain `string` so other locales
 * (Partial<Dict>) can legally hold their own translations rather than
 * being required to equal the English literal.
 */
export type Dict = { readonly [K in keyof typeof en]: string }
export type TKey = keyof Dict
