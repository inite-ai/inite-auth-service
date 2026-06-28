const createMDX = require('@next/mdx')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Treat .mdx files as page sources so app/docs/<slug>/page.mdx works
  // without an extra wrapper component per page.
  pageExtensions: ['ts', 'tsx', 'mdx'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002',
  },
  async rewrites() {
    // In production, proxy /admin/* API calls directly to the backend container
    // so they don't need to be exposed via Traefik
    const backendUrl = process.env.BACKEND_URL || 'http://auth-service:3002'
    return [
      {
        source: '/admin/:path*',
        has: [
          {
            type: 'header',
            key: 'content-type',
            value: 'application/json',
          },
        ],
        destination: `${backendUrl}/admin/:path*`,
      },
      {
        // Fallback: proxy any /admin/ request with Authorization header
        source: '/admin/:path*',
        has: [
          {
            type: 'header',
            key: 'authorization',
          },
        ],
        destination: `${backendUrl}/admin/:path*`,
      },
    ]
  },
}

const withMDX = createMDX({
  // No remark/rehype plugins yet — start with raw markdown + code fences.
  // Add `remark-gfm` for tables / strikethrough if a page needs it.
})

module.exports = withMDX(nextConfig)
