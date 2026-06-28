'use client'

import { HTMLAttributes, ReactNode } from 'react'

type BadgeVariant =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'mono'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  /** Render the text in a mono font (good for clientId, scope, audience). */
  mono?: boolean
  icon?: ReactNode
  children: ReactNode
}

/**
 * Compact status / category chip. Linear-style — faint background,
 * thin 1px border tinted to the variant, small uppercase or mono label.
 */
const variantClasses: Record<BadgeVariant, string> = {
  neutral:
    'bg-[var(--bg-overlay)] border-[var(--border)] text-[var(--text-muted)]',
  accent:
    'bg-[var(--accent-faint)] border-[color:var(--accent)]/30 text-[var(--accent)]',
  success:
    'bg-[color:var(--success)]/10 border-[color:var(--success)]/30 text-[color:var(--success)]',
  warning:
    'bg-[color:var(--warning)]/10 border-[color:var(--warning)]/30 text-[color:var(--warning)]',
  danger:
    'bg-[color:var(--danger)]/10 border-[color:var(--danger)]/30 text-[color:var(--danger)]',
  mono:
    'bg-[var(--bg-overlay)] border-[var(--border)] text-[var(--text)]',
}

export function Badge({
  variant = 'neutral',
  mono = false,
  icon,
  className = '',
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] leading-tight
        rounded border ${variantClasses[variant]}
        ${mono ? 'font-mono' : 'font-medium'}
        ${className}
      `}
      {...props}
    >
      {icon}
      {children}
    </span>
  )
}
