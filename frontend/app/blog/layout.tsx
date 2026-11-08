import { ReactNode } from 'react'
import { AppHeader } from '@/components/AppHeader'

/**
 * Blog shell: the same header and tokens as the docs, one reading column.
 * MDX typography comes from mdx-components.tsx, shared with the docs.
 */
export default function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AppHeader hideUserMenu context="Blog" />
      <main className="max-w-3xl mx-auto px-4 py-8 min-w-0">
        <article className="docs-content">{children}</article>
      </main>
    </div>
  )
}
