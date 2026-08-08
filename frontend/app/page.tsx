import type { Metadata } from 'next'
import { LandingShell } from '@/components/landing/LandingShell'
import { LandingBody } from '@/components/landing/LandingBody'
import {
  buildLandingMetadata,
  buildLandingJsonLd,
  jsonLdScript,
} from '@/lib/seo'

export const metadata: Metadata = buildLandingMetadata()

/**
 * Product landing — a server component.
 *
 * It previously rendered entirely on the client, so crawlers received a
 * five-word document: no H1, no feature copy, no structured data. The
 * interactive parts now live in LandingShell and the copy in LandingBody,
 * which stays a server component passed through as children.
 */
export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        // Organization + WebSite + SoftwareApplication + FAQPage.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildLandingJsonLd()) }}
      />
      <LandingShell>
        <LandingBody />
      </LandingShell>
    </>
  )
}
