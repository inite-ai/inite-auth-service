import '../globals.css'

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
