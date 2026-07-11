/** A per-tenant inbound SAML IdP connection, as returned by the admin API. */
export interface SamlConnection {
  id: string
  companyId: string
  slug: string
  displayName: string
  enabled: boolean
  idpEntityId: string
  idpSsoUrl: string
  createdAt: string
}

export interface CreateSamlConnectionInput {
  companyId: string
  slug: string
  displayName: string
  idpEntityId: string
  idpSsoUrl: string
  idpCert: string
  enabled?: boolean
}
