'use client'

import { useEffect, useState } from 'react'

/**
 * Square account avatar with an initial fallback.
 *
 * The previous version rendered a hover-revealed camera button over the
 * avatar in edit mode. It had no click handler and no file input behind it,
 * so it read as an upload affordance and did nothing. There is no avatar
 * storage on this service, so the honest control is the URL field in the
 * edit form; this component just renders what that field points at and
 * falls back cleanly when the URL is broken.
 */
export function Avatar({
  name,
  email,
  url,
}: {
  name?: string | null
  email?: string | null
  url?: string | null
}) {
  const [broken, setBroken] = useState(false)

  // A newly typed URL deserves a fresh attempt, even if the previous one failed.
  useEffect(() => setBroken(false), [url])

  const initial =
    name?.trim()?.[0]?.toUpperCase() ?? email?.trim()?.[0]?.toUpperCase() ?? '?'
  const showImage = !!url && !broken

  return (
    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-overlay)]">
      {showImage ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center text-xl font-semibold text-[var(--text-muted)]"
          aria-hidden="true"
        >
          {initial}
        </div>
      )}
    </div>
  )
}
