'use client'

import { FieldLabel, ChipInput } from './shared'

/**
 * Editors for the per-client vertical claims (OAuthClient.customClaims):
 * `policy` — ABAC policy sets brain resolves for every token issued
 * to/for this client; `packs` — pack fencing for indexer keys. Values
 * are sanitized server-side (custom-claims.ts) to identifier-charset
 * string arrays.
 */
export function CustomClaimsFields({
  policy,
  packs,
  onChange,
}: {
  policy: string[]
  packs: string[]
  onChange: (next: { policy: string[]; packs: string[] }) => void
}) {
  return (
    <>
      <div>
        <FieldLabel
          label="ABAC policy sets (policy claim)"
          hint="stamped on every token issued to this client — brain resolves them"
        />
        <ChipInput
          values={policy}
          onChange={(v) => onChange({ policy: v, packs })}
          placeholder="support-reader"
        />
      </div>

      <div>
        <FieldLabel
          label="Pack binding (packs claim)"
          hint="optional · fences indexer:write keys to these packs"
        />
        <ChipInput
          values={packs}
          onChange={(v) => onChange({ policy, packs: v })}
          placeholder="real_estate"
        />
      </div>
    </>
  )
}

/** Form → API payload: null when both lists are empty (clears the column). */
export function buildCustomClaimsPayload(
  policy: string[],
  packs: string[],
): { policy?: string[]; packs?: string[] } | null {
  if (policy.length === 0 && packs.length === 0) return null
  return {
    ...(policy.length > 0 ? { policy } : {}),
    ...(packs.length > 0 ? { packs } : {}),
  }
}
