'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { authStorage } from '@/lib/authStorage'
import { extractOAuthParams, buildConsentUrl, buildLoginUrl } from '@/lib/oauthHelpers'

function OAuthAuthorizeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const oauthParams = extractOAuthParams(searchParams)
    const responseType = searchParams.get('response_type')

    if (!oauthParams.clientId || !oauthParams.redirectUri) {
      setError('Missing required parameters')
      return
    }

    if (responseType !== 'code') {
      setError('Invalid response_type. Only "code" is supported.')
      return
    }

    // Check if user is authenticated
    const isAuthenticated = authStorage.isAuthenticated()
    console.log('🔐 [OAuth Authorize] Auth check:', isAuthenticated ? 'Authenticated' : 'Not authenticated')

    if (isAuthenticated) {
      router.push(buildConsentUrl(oauthParams))
    } else {
      router.push(buildLoginUrl(oauthParams))
    }
  }, [searchParams, router])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md">
          <h1 className="text-xl font-bold text-red-600 mb-4">Authorization Error</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center">
        <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
        <p className="text-gray-600">Processing authorization...</p>
      </div>
    </div>
  )
}

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <OAuthAuthorizeContent />
    </Suspense>
  )
}
