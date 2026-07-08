'use client'

import { useState, useEffect } from 'react'
import { Copy, Eye, EyeOff, KeyRound } from 'lucide-react'
import toast from 'react-hot-toast'

export function NewSecretDialog({
  secret,
  onClose,
}: {
  secret: string | null
  onClose: () => void
}) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!secret) setShow(false)
  }, [secret])

  if (!secret) return null

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-xl"
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-md flex items-center justify-center bg-[color:var(--warning)]/10 text-[color:var(--warning)]">
              <KeyRound className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                New client secret
              </h3>
              <p className="mt-0.5 text-xs text-[color:var(--warning)]">
                Save this secret now — it will not be shown again.
              </p>
            </div>
          </div>
          <div className="mt-4 relative">
            <input
              type={show ? 'text' : 'password'}
              readOnly
              value={secret}
              className="w-full h-9 px-3 pr-16 bg-[var(--bg)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] font-mono"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="p-1.5 text-[var(--text-faint)] hover:text-[var(--text)]"
                aria-label={show ? 'Hide' : 'Show'}
              >
                {show ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(secret)
                  toast.success('Copied')
                }}
                className="p-1.5 text-[var(--text-faint)] hover:text-[var(--text)]"
                aria-label="Copy"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            I&apos;ve saved it
          </button>
        </div>
      </div>
    </div>
  )
}
