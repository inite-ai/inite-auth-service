'use client'

/** A labelled on/off switch with a one-line explanation of each state. */
export function ToggleRow({
  on,
  onToggle,
  ariaLabel,
  title,
  hint,
}: {
  on: boolean
  onToggle: () => void
  ariaLabel: string
  title: string
  hint: string
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-md bg-[var(--bg)] border border-[var(--border)]">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onToggle}
        className={`relative w-9 h-5 shrink-0 rounded-full transition-colors ${
          on ? 'bg-[var(--accent)]' : 'bg-[var(--bg-overlay)]'
        }`}
        aria-label={ariaLabel}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            on ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
      <div className="min-w-0">
        <div className="text-xs font-medium text-[var(--text)]">{title}</div>
        <div className="text-[11px] text-[var(--text-muted)]">{hint}</div>
      </div>
    </div>
  )
}

/** Copy for the first-party switch, shared by the create and edit panels. */
export function firstPartyCopy(on: boolean) {
  return {
    title: on ? 'First-party app' : 'Third-party app',
    hint: on
      ? 'One of our own apps: signed-in people are not shown a consent screen.'
      : 'People approve it once on the consent screen; the answer is remembered.',
  }
}
