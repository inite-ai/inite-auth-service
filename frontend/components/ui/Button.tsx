'use client'

import { ButtonHTMLAttributes, forwardRef } from 'react'
import { Loader2 } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: React.ReactNode
  iconTrailing?: React.ReactNode
  /** Stretch to fill the parent. Default true to preserve existing call sites. */
  block?: boolean
}

/**
 * Linear-style button. Flat surfaces, 1px borders, single accent.
 *
 * Primary = solid violet (the one place we use a saturated fill).
 * Secondary = transparent w/ 1px border — the default action color.
 * Ghost = no border, hover overlay only.
 * Danger = transparent w/ red border, fills on hover.
 *
 * Sizes target Linear's compact rhythm: 28/32/40 px.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] active:translate-y-px',
  secondary:
    'bg-transparent border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--bg-overlay)] hover:border-[var(--text-faint)]',
  ghost:
    'bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)]',
  danger:
    'bg-transparent border border-[color:var(--danger)]/40 text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5',
  md: 'h-9 px-3 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      iconTrailing,
      children,
      disabled,
      block = true,
      className = '',
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`
          inline-flex items-center justify-center rounded-md font-medium
          transition-colors duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]
          ${block ? 'w-full' : ''}
          ${variantClasses[variant]}
          ${sizeClasses[size]}
          ${className}
        `}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          icon
        )}
        {children}
        {iconTrailing}
      </button>
    )
  },
)

Button.displayName = 'Button'
