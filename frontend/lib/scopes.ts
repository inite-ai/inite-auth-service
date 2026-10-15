import { CalendarCheck, Key, Mail, Shield, ShoppingCart, User, type LucideIcon } from 'lucide-react'
import type { TKey } from '@/lib/i18n'

/**
 * What each OAuth scope lets an application do, in plain words, for the
 * consent screen and the device-approval screen. The words live in the i18n
 * dictionaries under `consent.scope.<scope>`.
 *
 * A scope missing from this map is still shown, verbatim: a permission the
 * person cannot read is no reason to hide that it is being asked for.
 */
const SCOPE_INFO: Record<string, { icon: LucideIcon; description: TKey }> = {
  openid: { icon: Key, description: 'consent.scope.openid' },
  profile: { icon: User, description: 'consent.scope.profile' },
  email: { icon: Mail, description: 'consent.scope.email' },
  admin: { icon: Shield, description: 'consent.scope.admin' },
  offline_access: { icon: Key, description: 'consent.scope.offline_access' },
  'brain:read': { icon: Key, description: 'consent.scope.brain:read' },
  'brain:write': { icon: Key, description: 'consent.scope.brain:write' },
  'brain:admin': { icon: Shield, description: 'consent.scope.brain:admin' },
  'brain:read_pii': { icon: Shield, description: 'consent.scope.brain:read_pii' },
  'mikefluff:purchase': { icon: ShoppingCart, description: 'consent.scope.mikefluff:purchase' },
  'mikefluff:booking': { icon: CalendarCheck, description: 'consent.scope.mikefluff:booking' },
}

export interface ScopeLine {
  scope: string
  icon: LucideIcon
  /** Dictionary key, or null for a scope this UI has no words for. */
  description: TKey | null
}

/** The requested scopes, deduplicated, each with its icon and words. */
export function describeScopes(scope: string | null | undefined): ScopeLine[] {
  const requested = [...new Set((scope || 'openid profile email').split(/\s+/).filter(Boolean))]
  return requested.map((s) => {
    const info = SCOPE_INFO[s]
    return info ? { scope: s, ...info } : { scope: s, icon: Shield, description: null }
  })
}
