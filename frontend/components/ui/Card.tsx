'use client'

import { HTMLAttributes, forwardRef } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
}

const variantStyles = {
  default: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700',
  success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
  error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          rounded-2xl shadow-2xl p-8 border
          ${variantStyles[variant]}
          ${className}
        `}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Card.displayName = 'Card'

// Card Header component
export const CardHeader = ({ 
  icon, 
  title, 
  description,
  iconClassName = 'from-violet-500 to-purple-600',
}: { 
  icon: React.ReactNode
  title: string
  description?: string
  iconClassName?: string
}) => (
  <div className="text-center mb-8">
    <div className={`w-16 h-16 bg-gradient-to-br ${iconClassName} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
      {icon}
    </div>
    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
      {title}
    </h2>
    {description && (
      <p className="text-gray-600 dark:text-gray-400">
        {description}
      </p>
    )}
  </div>
)

