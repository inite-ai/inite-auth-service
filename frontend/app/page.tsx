'use client'

import { useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LoginPage from './login/page'

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // If OAuth params exist, redirect to login
    const clientId = searchParams.get('client_id')
    if (clientId) {
      const params = new URLSearchParams(searchParams.toString())
      router.push(`/login?${params.toString()}`)
    }
  }, [searchParams, router])

  return <LoginPage />
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  )
}

