export interface SsfStream {
  id: string
  streamId: string
  companyId?: string | null
  status: string
  deliveryMethod: 'push' | 'poll' | string
  pushEndpointUrl?: string | null
  pushAuthHeader?: string | null
  eventsRequested: string[]
  aud: string[]
  createdAt: string
}

// OpenID SSF / CAEP event types the transmitter emits. Kept in sync with
// src/ssf/caep-event-types.ts — friendly labels for the create form.
export const CAEP_EVENTS: Array<{ id: string; label: string; hint: string }> = [
  {
    id: 'https://schemas.openid.net/secevent/caep/event-type/session-revoked',
    label: 'Session revoked',
    hint: 'A subject’s session was revoked — the receiver should end it too.',
  },
  {
    id: 'https://schemas.openid.net/secevent/caep/event-type/credential-change',
    label: 'Credential change',
    hint: 'Password, passkey, or MFA factor added/removed/changed.',
  },
  {
    id: 'https://schemas.openid.net/secevent/caep/event-type/token-claims-change',
    label: 'Token claims change',
    hint: 'Roles/scopes/claims changed — re-evaluate access.',
  },
  {
    id: 'https://schemas.openid.net/secevent/risc/event-type/account-disabled',
    label: 'Account disabled',
    hint: 'The account was disabled or suspended.',
  },
]

export const EVENT_LABEL = new Map(CAEP_EVENTS.map((e) => [e.id, e.label]))
