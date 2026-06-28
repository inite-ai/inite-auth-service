'use client'

import { TonConnectUIProvider } from '@tonconnect/ui-react'
import { I18nProvider } from '@/lib/i18n'

const MANIFEST_URL = typeof window !== 'undefined'
  ? `${window.location.origin}/tonconnect-manifest.json`
  : 'https://auth.inite.ai/tonconnect-manifest.json'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <TonConnectUIProvider manifestUrl={MANIFEST_URL}>
        {children}
      </TonConnectUIProvider>
    </I18nProvider>
  )
}
