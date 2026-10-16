import { buildNoindexMetadata } from '@/lib/seo'

// This route is listed in APP_PATHS (app/robots.ts) as never indexable. Its
// page is a client component and cannot export metadata, so the directive has
// to live here or the root layout's `index, follow` applies by default.
export const metadata = buildNoindexMetadata()

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
