/**
 * Account-area strings (English source). Split out of dictionary.ts to
 * keep each file under the frontend size gate; merged back into `en`.
 */
export const enAccount = {
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
  'account.wallets.proofRefused':
    'Your wallet did not provide an ownership proof. Try connecting again.',
  'account.wallets.unlink': 'Unlink wallet',
  'account.wallets.unlink.confirm':
    'This address will no longer be able to sign in to your account.',
  'account.wallets.unlinked': 'Wallet unlinked',
  'account.wallets.primary': 'Primary',

  // Sessions / connected apps
  'account.apps.title': 'Connected apps',
  'account.apps.subtitle': 'Applications you let use your INITE account. You are not asked again while they stay connected.',
  'account.apps.empty': 'No connected apps',
  'account.apps.empty.hint': 'Apps you approve on the consent screen appear here.',
  'account.apps.granted': 'Approved {when}',
  'account.apps.disconnect': 'Disconnect',
  'account.apps.disconnect.confirm': '{name} loses access and signs you out there. It will ask for your consent again next time.',
  'account.apps.disconnected': 'App disconnected',
  'account.apps.agent': 'Agent ID',
  'account.apps.wallet': 'Can pay up to ${per} at a time, ${day} a day, ${month} a month',
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
