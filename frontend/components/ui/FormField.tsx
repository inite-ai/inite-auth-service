'use client'

import { ReactNode } from 'react'

interface FormFieldProps {
  label?: string
  /** Short hint shown under the label, before the control. */
  helper?: string
  /** Inline validation error; takes priority over `helper`. */
  error?: string | null
  /** Optional badge — e.g. "Optional", "Required", "New". */
  badge?: ReactNode
  /** id of the input control so the label associates correctly. */
  htmlFor?: string
  children: ReactNode
  className?: string
}

/**
 * Form field wrapper. Owns label + helper + error layout so individual
 * forms don't re-implement spacing and color rules. Pair with `Input`,
 * `Textarea`, or a raw control; the `htmlFor` prop wires the label to
 * the control for screen readers.
 *
 * Use this instead of inlining `<label>` / `<p className="text-red-500">`
 * around every input — keeps spacing consistent across the admin
 * modals (especially OAuthClientsSection where 12+ fields stack).
 */
export function FormField({
  label,
  helper,
  error,
  badge,
  htmlFor,
  children,
  className = '',
}: FormFieldProps) {
  return (
    <div className={`w-full ${className}`}>
      {(label || badge) && (
        <div className="flex items-center gap-2 mb-1.5">
          {label && (
            <label
              htmlFor={htmlFor}
              className="text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {label}
            </label>
          )}
          {badge}
        </div>
      )}
      {helper && !error && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{helper}</p>
      )}
      {children}
      {error && (
        <p
          className="mt-1 text-xs text-red-600 dark:text-red-400"
          role="alert"
        >
          {error}
        </p>
      )}
    </div>
  )
}
