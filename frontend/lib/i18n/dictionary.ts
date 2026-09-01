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

  // ---------- Account ----------
  'account.title': 'Account',
  'account.subtitle': 'Manage your identity, sign-in methods, and devices.',
  'account.nav.profile': 'Profile',
  'account.nav.security': 'Security',
  'account.nav.access': 'Access',
  'account.nav.activity': 'Activity',
  'account.nav.data': 'Your data',
  'account.error.title': "Couldn't load this section",
  'account.error.retry': 'Try again',
  'account.footer': 'INITE Identity Provider · Your identity, your control',

  // Profile
  'account.profile.title': 'Profile',
  'account.profile.subtitle': 'How you appear across INITE',
  'account.profile.edit': 'Edit',
  'account.profile.anonymous': 'Unnamed account',
  'account.profile.field.name': 'Display name',
  'account.profile.field.name.placeholder': 'Your name',
  'account.profile.field.bio': 'Bio',
  'account.profile.field.bio.placeholder': 'A sentence about you',
  'account.profile.field.location': 'Location',
  'account.profile.field.location.placeholder': 'City, Country',
  'account.profile.field.profession': 'Profession',
  'account.profile.field.profession.placeholder': 'What you do',
  'account.profile.field.avatar': 'Avatar image URL',
  'account.profile.field.avatar.helper':
    'Link to a square image. Leave empty to use your initial.',
  'account.profile.saved': 'Profile updated',
  'account.profile.saveFailed': 'Could not update profile',
  'account.profile.did': 'Decentralised identifier',

  // Email
  'account.email.verified': 'Verified',
  'account.email.unverified': 'Unverified',
  'account.email.verify': 'Verify',
  'account.email.change': 'Change email',
  'account.email.resend': 'Resend verification',
  'account.email.resent': 'Verification email sent',
  'account.email.pending.title': 'Email change waiting for confirmation',
  'account.email.pending.body':
    'We sent a confirmation link to {email}. Your address changes once you open it.',
  'account.email.pending.cancel': 'Cancel change',
  'account.email.pending.cancelled': 'Email change cancelled',
  'account.email.sheet.title': 'Change email address',
  'account.email.sheet.subtitle':
    'We email a confirmation link to the new address. Nothing changes until you open it.',
  'account.email.sheet.new': 'New email address',
  'account.email.sheet.password': 'Confirm with your password',
  'account.email.sheet.submit': 'Send confirmation link',
  'account.email.sheet.sent': 'Confirmation link sent to your new address',
  'account.email.error.same': 'That is already your email address',

  // Security overview
  'account.security.title': 'Security',
  'account.security.subtitle': 'How this account is protected',
  'account.security.score': 'Account protection',
  'account.security.score.strong': 'Strong',
  'account.security.score.fair': 'Could be stronger',
  'account.security.score.weak': 'Needs attention',
  'account.security.todo': 'Recommended next',
  'account.security.done.email': 'Email verified',
  'account.security.done.password': 'Password set',
  'account.security.done.twoFactor': 'Two-factor enabled',
  'account.security.done.passkeys': '{count} passkey(s)',
  'account.security.done.wallets': '{count} wallet(s) linked',
  'account.security.todo.email': 'Verify your email address',
  'account.security.todo.password': 'Set a password',
  'account.security.todo.twoFactor': 'Turn on two-factor authentication',
  'account.security.todo.passkeys': 'Add a passkey',
  'account.security.todo.wallets': 'Link a wallet',

  // Password
  'account.password.title': 'Password',
  'account.password.set': 'Password is set',
  'account.password.unset': 'No password set',
  'account.password.change': 'Change',
  'account.password.create': 'Set password',
  'account.password.sheet.title': 'Change password',
  'account.password.sheet.subtitle':
    'Changing your password signs you out on every other device.',
  'account.password.current': 'Current password',
  'account.password.new': 'New password',
  'account.password.confirm': 'Confirm new password',
  'account.password.rule.length': 'At least 8 characters',
  'account.password.rule.uppercase': 'One uppercase letter',
  'account.password.rule.number': 'One number',
  'account.password.rule.match': 'Both entries match',
  'account.password.changed': 'Password changed — other devices signed out',
  'account.password.error.mismatch': 'The two passwords do not match',
  'account.password.error.rules': 'The new password does not meet the rules',

  // Two-factor
  'account.twoFactor.title': 'Two-factor authentication',
  'account.twoFactor.on': 'Authenticator app enabled',
  'account.twoFactor.off': 'A code from your phone, on top of your password',
  'account.twoFactor.enable': 'Turn on',
  'account.twoFactor.disable': 'Turn off',
  'account.twoFactor.setup.title': 'Set up two-factor authentication',
  'account.twoFactor.setup.step1': 'Scan this code with your authenticator app',
  'account.twoFactor.setup.manual': 'Or enter this key manually',
  'account.twoFactor.setup.step2': 'Enter the 6-digit code it shows',
  'account.twoFactor.setup.submit': 'Verify and turn on',
  'account.twoFactor.setup.enabled': 'Two-factor authentication is on',
  'account.twoFactor.disable.title': 'Turn off two-factor authentication',
  'account.twoFactor.disable.warning':
    'Your account will be protected by your password alone.',
  'account.twoFactor.disable.submit': 'Turn off',
  'account.twoFactor.disabled': 'Two-factor authentication turned off',
  'account.twoFactor.code': '6-digit code',

  // Backup codes
  'account.backupCodes.title': 'Recovery codes',
  'account.backupCodes.remaining': '{count} of 10 unused',
  'account.backupCodes.low':
    'Only {count} left. Generate a new set before you run out.',
  'account.backupCodes.none': 'No recovery codes left — generate a new set',
  'account.backupCodes.regenerate': 'Generate new codes',
  'account.backupCodes.saved.title': 'Save your recovery codes',
  'account.backupCodes.saved.body':
    'Each code works once if you lose your authenticator. This is the only time they are shown.',
  'account.backupCodes.copy': 'Copy',
  'account.backupCodes.download': 'Download',
  'account.backupCodes.confirm': "I've saved them",
  'account.backupCodes.copied': 'Recovery codes copied',
  'account.backupCodes.replaced': 'New recovery codes generated — the old ones no longer work',

  // Passkeys
  'account.passkeys.title': 'Passkeys',
  'account.passkeys.subtitle': 'Sign in with your fingerprint, face, or security key',
  'account.passkeys.add': 'Add passkey',
  'account.passkeys.empty': 'No passkeys yet',
  'account.passkeys.empty.hint':
    'A passkey replaces your password with your device unlock — and cannot be phished.',
  'account.passkeys.added': 'Passkey added',
  'account.passkeys.cancelled': 'Passkey setup cancelled',
  'account.passkeys.remove': 'Remove passkey',
  'account.passkeys.remove.confirm':
    'You will no longer be able to sign in with this passkey.',
  'account.passkeys.removed': 'Passkey removed',
  'account.passkeys.lastOne':
    'This is your only passwordless sign-in method. Removing it leaves your password as the only way in.',

  // Wallets
  'account.wallets.title': 'Linked wallets',
  'account.wallets.subtitle': 'Web3 addresses that can sign in to this account',
  'account.wallets.addEvm': 'Link EVM',
  'account.wallets.addTon': 'Link TON',
  'account.wallets.connecting': 'Waiting for your wallet…',
  'account.wallets.empty': 'No wallets linked',
  'account.wallets.empty.hint':
    'Link an Ethereum, Polygon, BSC, or TON address to sign in with your wallet.',
  'account.wallets.linked': 'Wallet linked',
  'account.wallets.cancelled': 'Wallet connection cancelled',
  'account.wallets.unlink': 'Unlink wallet',
  'account.wallets.unlink.confirm':
    'This address will no longer be able to sign in to your account.',
  'account.wallets.unlinked': 'Wallet unlinked',
  'account.wallets.primary': 'Primary',

  // Sessions / connected apps
  'account.sessions.title': 'Where you are signed in',
  'account.sessions.subtitle': 'Apps and devices holding a live session',
  'account.sessions.thisDevice': 'This device',
  'account.sessions.unknownDevice': 'Unknown device',
  'account.sessions.lastUsed': 'Last used {when}',
  'account.sessions.created': 'Started {when}',
  'account.sessions.expires': 'Expires {when}',
  'account.sessions.expiringSoon': 'Expires within a day',
  'account.sessions.revoke': 'Sign out',
  'account.sessions.revoke.confirm':
    'This app will need to sign in again to reach your account.',
  'account.sessions.revoked': 'Signed out of that session',
  'account.sessions.revokeOthers': 'Sign out everywhere else',
  'account.sessions.revokeOthers.confirm':
    'Every other app and device is signed out. This one stays signed in.',
  'account.sessions.revokedOthers': 'Signed out everywhere else',
  'account.sessions.empty': 'No other active sessions',
  'account.sessions.empty.hint':
    'Apps you sign in to with your INITE account will appear here.',
  'account.sessions.scopes': 'Access granted',

  // Activity
  'account.activity.title': 'Recent activity',
  'account.activity.subtitle': 'Security-relevant events on your account',
  'account.activity.empty': 'Nothing recorded yet',
  'account.activity.empty.hint':
    'Sign-ins, password changes, and app authorisations show up here.',
  'account.activity.showAll': 'Show all {count}',
  'account.activity.showLess': 'Show less',
  'account.activity.repeated': '{count}×',
  'account.activity.unknownDevice': 'unknown device',

  // Data / danger zone
  'account.data.title': 'Your data',
  'account.data.subtitle': 'Export everything, or close the account for good',
  'account.data.export.title': 'Export your data',
  'account.data.export.body': 'Download everything we hold, as JSON',
  'account.data.export.cta': 'Export',
  'account.data.export.done': 'Export downloaded',
  'account.data.delete.title': 'Delete account',
  'account.data.delete.body': 'Permanently remove this account and all its data',
  'account.data.delete.cta': 'Delete',
  'account.data.delete.sheet.title': 'Delete your account?',
  'account.data.delete.sheet.warning':
    'This cannot be undone. Export your data first if you want to keep it.',
  'account.data.delete.sheet.list': 'What gets deleted',
  'account.data.delete.item.identity': 'Your profile and identifier (DID)',
  'account.data.delete.item.wallets': 'Every linked wallet',
  'account.data.delete.item.passkeys': 'Every passkey',
  'account.data.delete.item.sessions': 'Every active session',
  'account.data.delete.item.credentials': 'Every issued credential',
  'account.data.delete.confirmLabel': 'Type {word} to confirm',
  'account.data.delete.submit': 'Delete permanently',
  'account.data.delete.done': 'Account deleted',

  // Legacy keys kept for the audit section's previous call sites.
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
