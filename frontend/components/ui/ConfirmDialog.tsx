'use client'

import { ReactNode, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Loader2 } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** danger uses red, default uses accent. */
  intent?: 'danger' | 'default'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Small centered confirmation. Used only for destructive or
 * irreversible actions where breaking the user's flow is the point.
 * Everything else lives in a Sheet.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  intent = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => !busy && onCancel()}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.14 }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-sm bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-xl"
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div
                  className={`shrink-0 w-9 h-9 rounded-md flex items-center justify-center ${
                    intent === 'danger'
                      ? 'bg-[color:var(--danger)]/10 text-[color:var(--danger)]'
                      : 'bg-[var(--accent-faint)] text-[var(--accent)]'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--text)] tracking-tight">
                    {title}
                  </h3>
                  {description && (
                    <div className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
                      {description}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="h-8 px-3 inline-flex items-center text-xs rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] disabled:opacity-50 transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className={`h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md text-white disabled:opacity-50 transition-colors ${
                  intent === 'danger'
                    ? 'bg-[color:var(--danger)] hover:bg-[color:var(--danger)]/85'
                    : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)]'
                }`}
              >
                {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
