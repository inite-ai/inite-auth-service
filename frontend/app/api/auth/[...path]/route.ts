import { NextRequest, NextResponse } from 'next/server'

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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path, 'PUT')
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  return proxyRequest(request, path, 'DELETE')
}

async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
) {
  const path = pathSegments.join('/')
  const url = `${API_URL}/auth/${path}`
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  
  // Forward authorization header
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    headers['Authorization'] = authHeader
  }
  
  // Forward cookies
  const cookies = request.headers.get('cookie')
  if (cookies) {
    headers['Cookie'] = cookies
  }

  let body: string | undefined
  if (method !== 'GET' && method !== 'HEAD') {
    try {
      body = JSON.stringify(await request.json())
    } catch {
      // No body
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
  })

  const data = await response.json().catch(() => ({}))
  
  const res = NextResponse.json(data, { status: response.status })
  
  // Forward Set-Cookie headers from backend
  const setCookies = response.headers.getSetCookie()
  for (const cookie of setCookies) {
    res.headers.append('Set-Cookie', cookie)
  }
  
  return res
}

