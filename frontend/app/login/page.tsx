'use client'

import { Suspense } from 'react'
import AuthPage, { AuthPageFallback } from '@/components/AuthPage'

export default function LoginPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <AuthPage variant="login" />
    </Suspense>
  )
}

