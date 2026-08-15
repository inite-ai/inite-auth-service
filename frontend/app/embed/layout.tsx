import '../globals.css'
import { buildNoindexMetadata } from '@/lib/seo'

// Listed in APP_PATHS (app/robots.ts) as never indexable. This is its own root
// layout, so it does not inherit the site defaults — but it did not set any
// robots directive either, and a page with none is indexable by default.
export const metadata = buildNoindexMetadata()

/**
 * Embed routes get a stripped layout — no marketing chrome, no
 * toast portal, no global providers. The page is meant to live
 * inside a 320–400px iframe on a third-party site, so visual
 * weight stays minimal.
 *
 * Keep this in sync with the main app's body class to inherit
 * fonts; everything else (analytics, theme switcher, etc.) is
 * intentionally absent.
 */
export default function EmbedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-transparent">{children}</body>
    </html>
  )
}
