'use client'

import { Suspense } from 'react'
import AuthPage, { AuthPageFallback } from '@/components/AuthPage'

export default function RegisterPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <AuthPage variant="register" />
    </Suspense>
  )
}



