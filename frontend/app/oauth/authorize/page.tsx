'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

function OAuthAuthorizeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkAndRedirect = () => {
      const clientId = searchParams.get('client_id')
      const redirectUri = searchParams.get('redirect_uri')
      const scope = searchParams.get('scope')
      const state = searchParams.get('state')
      const codeChallenge = searchParams.get('code_challenge')
      const codeChallengeMethod = searchParams.get('code_challenge_method')
      const responseType = searchParams.get('response_type')

      if (!clientId || !redirectUri) {
        setError('Missing required parameters')
        return
      }

      if (responseType !== 'code') {
        setError('Invalid response_type. Only "code" is supported.')
        return
      }

      // Check if we have a saved token in localStorage (SSO)
      const savedToken = localStorage.getItem('inite_access_token')
      console.log('🔐 [OAuth Authorize] Checking auth:', savedToken ? 'Token found' : 'No token')

      // Build consent URL with all OAuth params
      const consentUrl = new URL('/oauth/consent', window.location.origin)
      consentUrl.searchParams.set('client_id', clientId)
      consentUrl.searchParams.set('redirect_uri', redirectUri)
      if (scope) consentUrl.searchParams.set('scope', scope)
      if (state) consentUrl.searchParams.set('state', state)
      if (codeChallenge) consentUrl.searchParams.set('code_challenge', codeChallenge)
      if (codeChallengeMethod) consentUrl.searchParams.set('code_challenge_method', codeChallengeMethod)

      if (savedToken) {
        // User has token, redirect to consent page to confirm
        console.log('🔐 [OAuth Authorize] User authenticated, redirecting to consent')
        router.push(consentUrl.pathname + consentUrl.search)
      } else {
        // No token, redirect to login first
        console.log('🔐 [OAuth Authorize] User not authenticated, redirecting to login')
        const loginUrl = new URL('/login', window.location.origin)
        loginUrl.searchParams.set('client_id', clientId)
        loginUrl.searchParams.set('redirect_uri', redirectUri)
        if (scope) loginUrl.searchParams.set('scope', scope)
        if (state) loginUrl.searchParams.set('state', state)
        if (codeChallenge) loginUrl.searchParams.set('code_challenge', codeChallenge)
        if (codeChallengeMethod) loginUrl.searchParams.set('code_challenge_method', codeChallengeMethod)
        
        router.push(loginUrl.pathname + loginUrl.search)
      }
    }

    checkAndRedirect()
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

