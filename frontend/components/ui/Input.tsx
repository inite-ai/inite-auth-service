'use client'

import { forwardRef, InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helper?: string
  showPasswordToggle?: boolean
  onPasswordToggle?: () => void
  isPasswordVisible?: boolean
}

/**
 * Linear-style input. Flat surface, 1px border, subtle accent ring
 * on focus. Helper text under the field reserves space so it doesn't
 * shift layout when an error appears.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helper,
      className = '',
      showPasswordToggle,
      onPasswordToggle,
      isPasswordVisible,
      id,
      ...props
    },
    ref,
  ) => {
    const inputId = id ?? props.name
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            className={`
              w-full h-9 px-3
              bg-[var(--bg-elevated)]
              border ${error ? 'border-[color:var(--danger)]/60' : 'border-[var(--border-strong)]'}
              rounded-md
              text-sm text-[var(--text)]
              placeholder:text-[var(--text-faint)]
              transition-colors duration-150
              focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)]/30
              disabled:opacity-50 disabled:cursor-not-allowed
              ${showPasswordToggle ? 'pr-9' : ''}
              ${className}
            `}
            {...props}
          />
          {showPasswordToggle && (
            <button
              type="button"
              onClick={onPasswordToggle}
              aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
              aria-pressed={isPasswordVisible}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-faint)] hover:text-[var(--text-muted)] rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
            >
              {isPasswordVisible ? (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>
        {error ? (
          <p className="mt-1 text-xs text-[color:var(--danger)]" role="alert">
            {error}
          </p>
        ) : helper ? (
          <p className="mt-1 text-xs text-[var(--text-faint)]">{helper}</p>
        ) : null}
      </div>
    )
  },
)

Input.displayName = 'Input'
