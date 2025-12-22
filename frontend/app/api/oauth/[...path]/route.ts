import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path, 'GET')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path, 'POST')
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
) {
  const path = pathSegments.join('/')
  const url = new URL(`${API_URL}/oauth/${path}`)
  
  // Forward query params
  request.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value)
  })
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  // Forward authorization header
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    headers['Authorization'] = authHeader
  }
  
  // Forward cookies using Next.js cookies API
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  if (allCookies.length > 0) {
    headers['Cookie'] = allCookies.map(c => `${c.name}=${c.value}`).join('; ')
  }

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      body = JSON.stringify(await request.json())
    } catch {
      // No body
    }
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body,
    redirect: 'manual', // Don't follow redirects, return them to client
  })

  // Handle redirects
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get('location')
    if (location) {
      const res = NextResponse.redirect(location, response.status)
      
      // Forward Set-Cookie headers
      const setCookies = response.headers.getSetCookie()
      for (const cookie of setCookies) {
        res.headers.append('Set-Cookie', cookie)
      }
      
      return res
    }
  }

  const data = await response.json().catch(() => ({}))
  
  const res = NextResponse.json(data, { status: response.status })
  
  // Forward Set-Cookie headers from backend
  const setCookies = response.headers.getSetCookie()
  for (const cookie of setCookies) {
    res.headers.append('Set-Cookie', cookie)
  }
  
  return res
}

