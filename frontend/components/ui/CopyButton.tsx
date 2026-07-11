'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Copy, Check } from 'lucide-react'
import toast from 'react-hot-toast'

/**
 * Compact copy-to-clipboard affordance for IDs, tokens, and URLs. Shows a
 * momentary check on success and a toast, and is always labelled for screen
 * readers. Icon-only by default; pass `label` to also render the text.
 */
export function CopyButton({
  value,
  what = 'Value',
  label,
  className = '',
}: {
  value: string
  /** Human name used in the aria-label + toast, e.g. "DID". */
  what?: string
  /** Optional visible text rendered before the icon. */
  label?: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = useCallback(() => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    toast.success(`${what} copied`)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1200)
  }, [value, what])

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${what.toLowerCase()}`}
      title={`Copy ${what.toLowerCase()}`}
      className={`inline-flex items-center gap-1 text-[var(--text-faint)] hover:text-[var(--text)] transition-colors ${className}`}
    >
      {label && <span>{label}</span>}
      {copied ? (
        <Check className="w-3 h-3 text-[color:var(--success)]" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  )
}
