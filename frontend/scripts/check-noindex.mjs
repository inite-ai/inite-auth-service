#!/usr/bin/env node
/**
 * robots.txt / meta-robots parity gate.
 *
 * app/robots.ts declares APP_PATHS "never indexable" and disallows every one
 * of them. Each of those routes is a client component, so it cannot export
 * metadata of its own and silently inherits the root layout's `index, follow`
 * — which is the exact opposite instruction, shipped on the same page. Nothing
 * failed when that happened. Search Console found auth.inite.ai/register in
 * the 2026-08 crawl, months after the fact, and only because someone went
 * looking at a not-indexed report.
 *
 * The fix is a layout.tsx per route carrying buildNoindexMetadata(). This gate
 * holds it: every APP_PATHS entry that exists as a route directory must have a
 * layout that sets the directive. A new auth route added without one fails CI
 * instead of quietly inviting Google in.
 *
 * Follows the same shape as check-file-size.mjs — a plain node gate, because
 * the frontend has no test runner and CI already calls scripts this way.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const APP = join(ROOT, 'app')

/** The declared not-indexable set, read from app/robots.ts rather than copied. */
function declaredPaths() {
  const src = readFileSync(join(APP, 'robots.ts'), 'utf8')
  const block = /export const APP_PATHS\s*=\s*\[([\s\S]*?)\]/.exec(src)
  if (!block) {
    console.error('✖ noindex gate: could not find APP_PATHS in app/robots.ts')
    process.exit(1)
  }
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/^\/|\/$/g, ''))
}

const missing = []
const unrouted = []

for (const path of declaredPaths()) {
  const dir = join(APP, path)
  // A declared path with no directory is a prefix guarded ahead of the route
  // existing — fine, and worth reporting rather than failing on.
  if (!existsSync(dir)) {
    unrouted.push(path)
    continue
  }
  const layout = join(dir, 'layout.tsx')
  if (!existsSync(layout) || !/buildNoindexMetadata\(\)/.test(readFileSync(layout, 'utf8'))) {
    missing.push(path)
  }
}

if (missing.length) {
  console.error(`\n✖ noindex gate: ${missing.length} disallowed route(s) still inherit index,follow:\n`)
  for (const p of missing) console.error(`  /${p}  → add app/${p}/layout.tsx with buildNoindexMetadata()`)
  console.error('\nrobots.ts calls these never-indexable; the pages must say so too.\n')
  process.exit(1)
}

const note = unrouted.length ? ` (${unrouted.length} declared without a route: ${unrouted.join(', ')})` : ''
console.log(`✓ noindex gate: every disallowed route carries a noindex layout.${note}`)
