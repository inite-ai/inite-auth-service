'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

function OAuthAuthorizeContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const checkSessionAndAuthorize = async () => {
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

      // Check if we have a session by trying to create a code
      try {
        const response = await fetch('/oauth/create-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            clientId,
            redirectUri,
            scope,
            state,
            codeChallenge,
            codeChallengeMethod,
          }),
        })

        if (response.ok) {
          // User is authenticated, we got a code
          const data = await response.json()
          const url = new URL(redirectUri)
          url.searchParams.set('code', data.code)
          if (state) url.searchParams.set('state', state)
          window.location.href = url.toString()
          return
        }

        if (response.status === 401) {
          // User not authenticated, redirect to login
          const loginUrl = new URL('/login', window.location.origin)
          loginUrl.searchParams.set('client_id', clientId)
          loginUrl.searchParams.set('redirect_uri', redirectUri)
          if (scope) loginUrl.searchParams.set('scope', scope)
          if (state) loginUrl.searchParams.set('state', state)
          if (codeChallenge) loginUrl.searchParams.set('code_challenge', codeChallenge)
          if (codeChallengeMethod) loginUrl.searchParams.set('code_challenge_method', codeChallengeMethod)
          
          router.push(loginUrl.pathname + loginUrl.search)
          return
        }

        const errorData = await response.json().catch(() => ({}))
        setError(errorData.message || 'Authorization failed')
      } catch (err) {
        console.error('Authorization error:', err)
        setError('Failed to process authorization request')
      }
    }

    checkSessionAndAuthorize()
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

