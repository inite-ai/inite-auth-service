// Relative "3m ago" formatting is shared across admin tables.
export { formatRelative } from '../form-controls'

export interface UserRow {
  id: string
  name?: string | null
  email?: string | null
  emailVerified?: boolean
  did?: string
  bio?: string | null
  location?: string | null
  profession?: string | null
  twoFactorEnabled?: boolean
  createdAt: string
  metadata?: {
    roles?: string[]
    [key: string]: any
  }
}

export interface UserDetails extends UserRow {
  passkeys?: any[]
  wallets?: any[]
  stats?: {
    totalPasskeys: number
    totalWallets: number
    activeSessions: number
  }
}

export type RoleFilter = 'all' | 'admin' | 'user'
