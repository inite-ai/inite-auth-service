export interface SecurityStatus {
  hasPassword: boolean
  twoFactorEnabled: boolean
  passkeysCount: number
  walletsCount: number
  emailVerified: boolean
}

export interface SecuritySectionProps {
  securityStatus: SecurityStatus
  accessToken: string
  onUpdate: () => void
}
