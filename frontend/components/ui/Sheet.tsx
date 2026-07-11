'use client'

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { ConfirmDialog } from './ConfirmDialog'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  width?: 'sm' | 'md' | 'lg'
  /**
   * When true, closing (Escape / backdrop / X) asks the user to confirm before
   * discarding — for panels with unsaved edits. Default false = close directly.
   */
  dirty?: boolean
  /** Sticky footer (typically Cancel + primary action). */
  footer?: ReactNode
  children: ReactNode
}

/**
 * Right-anchored slide-in panel. Replaces centered modals across the admin —
 * list stays visible to the left, edit/details slides in to the right. Sticky
 * header + scrollable body + optional sticky footer. Focus is trapped inside
 * while open and restored to the trigger on close; a `dirty` panel guards
 * against losing unsaved edits.
 *
 * Width:
 *   sm — 420px, tight forms
 *   md — 520px, default for edit/detail panels
 *   lg — 680px, dense forms (e.g. New OAuth Client)
 */
const widthClass: Record<NonNullable<SheetProps['width']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-2xl',
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  width = 'md',
  dirty = false,
  footer,
  children,
}: SheetProps) {
  const panelRef = useRef<HTMLElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  // Closing a dirty panel routes through a discard confirmation.
  const attemptClose = useCallback(() => {
    if (dirty) setConfirmDiscard(true)
    else onClose()
  }, [dirty, onClose])

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  // Escape closes (via the dirty guard).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') attemptClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, attemptClose])

  // Focus management: focus the first control on open, trap Tab within the
  // panel, and restore focus to the trigger element on close.
  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    // Defer so the framer-motion node is mounted.
    const raf = requestAnimationFrame(() => focusables()[0]?.focus())

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    panel?.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(raf)
      panel?.removeEventListener('keydown', onKey)
      restoreFocusRef.current?.focus?.()
    }
  }, [open])

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-40"
              onClick={attemptClose}
            />
            <motion.aside
              ref={panelRef}
              key="panel"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', ease: [0.16, 1, 0.3, 1], duration: 0.25 }}
              className={`fixed top-0 right-0 bottom-0 z-50 w-full ${widthClass[width]} bg-[var(--bg-elevated)] border-l border-[var(--border)] flex flex-col`}
              role="dialog"
              aria-modal="true"
              aria-label={title}
            >
              <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--border)] shrink-0">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold text-[var(--text)] tracking-tight truncate">
                    {title}
                  </h2>
                  {subtitle && (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)] font-mono truncate">
                      {subtitle}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={attemptClose}
                  aria-label="Close"
                  className="p-1.5 -mr-1 text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--bg-overlay)] rounded-md transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

              {footer && (
                <footer className="px-5 py-3 border-t border-[var(--border)] bg-[var(--bg-elevated)] shrink-0">
                  {footer}
                </footer>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        description="You have unsaved changes. Closing now will lose them."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        intent="danger"
        onConfirm={() => {
          setConfirmDiscard(false)
          onClose()
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  )
}
