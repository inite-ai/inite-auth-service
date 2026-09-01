/** One row from GET /auth/security/audit. */
export interface AuditEvent {
  id: string
  ts: string
  event: string
  success: boolean
  errorMessage: string | null
  ip: string | null
  userAgent: string | null
  clientId: string | null
  scopes: string[]
  audience: string | null
}

/** Consecutive identical events, collapsed into one row. */
export interface AuditEventGroup {
  id: string
  event: string
  count: number
  /** The most recent event in the run — the list is newest-first. */
  latest: AuditEvent
}

/**
 * Fold runs of the same event from the same device into single rows.
 *
 * An account that signs in with a password every few days produced twenty
 * consecutive rows reading "Signed in with password / unknown device", which
 * is a lot of screen for one fact. Only ADJACENT events are merged, so an
 * unusual event in the middle of a run still breaks it up and stays visible
 * rather than being folded away.
 */
export function groupAuditEvents(events: AuditEvent[]): AuditEventGroup[] {
  const groups: AuditEventGroup[] = []

  for (const event of events) {
    const previous = groups[groups.length - 1]
    const continuesRun =
      previous &&
      previous.event === event.event &&
      previous.latest.ip === event.ip &&
      previous.latest.userAgent === event.userAgent &&
      previous.latest.errorMessage === event.errorMessage

    if (continuesRun) {
      previous.count += 1
    } else {
      groups.push({ id: event.id, event: event.event, count: 1, latest: event })
    }
  }

  return groups
}
