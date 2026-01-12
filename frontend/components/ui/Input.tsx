'use client'

import { forwardRef, InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  showPasswordToggle?: boolean
  onPasswordToggle?: () => void
  isPasswordVisible?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', showPasswordToggle, onPasswordToggle, isPasswordVisible, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            className={`
              w-full px-4 py-3 
              bg-gray-50 dark:bg-gray-900 
              border border-gray-300 dark:border-gray-600 
              rounded-xl 
              focus:ring-2 focus:ring-violet-500 focus:border-transparent 
              transition
              ${showPasswordToggle ? 'pr-12' : ''}
              ${error ? 'border-red-500 focus:ring-red-500' : ''}
              ${className}
            `}
            {...props}
          />
          {showPasswordToggle && (
            <button
              type="button"
              onClick={onPasswordToggle}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              {isPasswordVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          )}
        </div>
        {error && (
          <p className="mt-1 text-sm text-red-500">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'



