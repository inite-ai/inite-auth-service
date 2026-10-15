'use client'

import { describeScopes } from '@/lib/scopes'
import { useT } from '@/lib/i18n'

/** The permissions being asked for, one line each (lib/scopes.ts). */
export function ScopeList({ scope }: { scope: string | null | undefined }) {
  const t = useT()
  return (
    <ul className="space-y-2">
      {describeScopes(scope).map(({ scope: s, icon: Icon, description }) => (
        <li key={s} className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
          <Icon className="w-5 h-5 text-green-500 flex-shrink-0" />
          <span className="text-sm">
            {description ? t(description) : t('consent.scope.other', { scope: s })}
          </span>
        </li>
      ))}
    </ul>
  )
}
