import { ImageResponse } from 'next/og'
import { BRAND, META } from '@/lib/brand'

export const alt = META.ogTitle
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

/**
 * Social card for the landing. Generated at build time from the same brand
 * copy the page renders, so the card cannot drift from the headline.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px',
          background: '#0b0b0d',
          color: '#fafafa',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            I
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5 }}>
            {BRAND.name}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              letterSpacing: -2,
              lineHeight: 1.05,
            }}
          >
            {META.ogTitle}
          </div>
          <div style={{ fontSize: 28, color: '#a1a1aa', lineHeight: 1.4 }}>
            OAuth 2.0 / OIDC · passkeys · magic links · service tokens · MCP
          </div>
        </div>

        <div style={{ fontSize: 24, color: '#71717a' }}>auth.inite.ai</div>
      </div>
    ),
    size,
  )
}
