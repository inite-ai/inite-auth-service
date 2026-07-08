export interface FederationProviderSummary {
  slug: string
  displayName: string
  enabled: boolean
  source: 'db' | 'env' | 'unset'
  clientId: string
  hasSecret: boolean
  scopes: string[]
  issuer: string | null
  callbackUrl: string
  requiresIssuer: boolean
}
