'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AuthPageFallback, useOAuthParams } from '@/components/auth-page/shared'
import { RequestResetForm, SetPasswordForm } from '@/components/ResetPassword'

function ResetPasswordContent() {
  const token = useSearchParams().get('token')
  const oauthParams = useOAuthParams()
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {token ? (
          <SetPasswordForm token={token} oauthParams={oauthParams} />
        ) : (
          <RequestResetForm oauthParams={oauthParams} />
        )}
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthPageFallback />}>
      <ResetPasswordContent />
    </Suspense>
  )
}
