/**
 * Shapes the account page reads from the identity API.
 *
 * These were `any` throughout, which is how the edit form came to write
 * `undefined` over stored bio/location/profession without anything
 * complaining — GET /me simply did not return them, and nothing said so.
 */

/** An email change that has been requested but not yet confirmed. */
export interface PendingEmailChange {
  newEmail: string
  expiresAt: string
}

/** GET /auth/identity/me */
export interface AccountUser {
  id: string
  did: string
  email: string
  emailVerified: boolean
  name?: string | null
  avatarUrl?: string | null
  bio?: string | null
  location?: string | null
  profession?: string | null
  pendingEmailChange?: PendingEmailChange | null
  metadata?: { isAdmin?: boolean } | null
  createdAt?: string
}

/** GET /auth/identity/security-status */
export interface SecurityStatus {
  hasPassword: boolean
  twoFactorEnabled: boolean
  passkeysCount: number
  walletsCount: number
  emailVerified: boolean
  backupCodesRemaining: number
}

/** GET /auth/passkey/list */
export interface Passkey {
  id: string
  name?: string | null
  deviceType?: string | null
  createdAt: string
  lastUsedAt?: string | null
}

/** GET /auth/identity/wallets */
export interface LinkedWallet {
  id: string
  address: string
  chain: string
  isPrimary?: boolean
  createdAt?: string
}

/** GET /auth/session/active */
export interface ActiveSession {
  id: string
  clientId: string
  clientName?: string | null
  scope?: string | null
  createdAt: string
  expiresAt: string
  lastUsedAt?: string | null
  ip?: string | null
  userAgent?: string | null
  isCurrentDevice: boolean
}
