'use client'

import { HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'flat'
  /** Compact padding for in-list cards. Default false. */
  dense?: boolean
}

/**
 * Linear-style card. Flat surface, 1px border, no drop shadow. The
 * `variant` prop tints the border + faint background for status
 * cards; `flat` removes the border entirely for cards inside a
 * larger framed surface (admin sections).
 */
const variantClasses: Record<NonNullable<CardProps['variant']>, string> = {
  default:
    'bg-[var(--bg-elevated)] border border-[var(--border)]',
  flat:
    'bg-[var(--bg-elevated)]',
  success:
    'bg-[color:var(--success)]/5 border border-[color:var(--success)]/30',
  warning:
    'bg-[color:var(--warning)]/5 border border-[color:var(--warning)]/30',
  error:
    'bg-[color:var(--danger)]/5 border border-[color:var(--danger)]/30',
  info:
    'bg-[var(--accent-faint)] border border-[color:var(--accent)]/30',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', dense = false, className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          rounded-lg
          ${dense ? 'p-4' : 'p-6'}
          ${variantClasses[variant]}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    )
  },
)

Card.displayName = 'Card'

/**
 * Section header used inside Card. Icon stays small, no gradient
 * box — Linear-style is to let typography do the heavy lifting.
 */
export const CardHeader = ({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  /**
   * Legacy: ignored. Kept on the type so existing call sites that
   * pass `iconClassName` from the old API don't break the build.
   */
  iconClassName?: string
}) => (
  <div className="flex items-start justify-between gap-4 mb-5">
    <div className="flex items-start gap-3">
      {icon && (
        <div className="w-8 h-8 rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
          {icon}
        </div>
      )}
      <div>
        <h2 className="text-base font-semibold text-[var(--text)] tracking-tight">
          {title}
        </h2>
        {description && (
          <p className="text-sm text-[var(--text-muted)] mt-0.5">
            {description}
          </p>
        )}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
)
