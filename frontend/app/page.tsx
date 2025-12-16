'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import LoginPage from './login/page'

export default function Home() {
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

