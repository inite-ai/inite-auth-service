#!/usr/bin/env node
/**
 * Frontend god-file gate.
 *
 * The backend enforces `max-lines: 300` (skipBlankLines + skipComments) via
 * ESLint, but the frontend is excluded from that flat config and `next lint`
 * is currently unusable, so nothing stopped a 2000-line React component from
 * growing. This guard restores the ceiling: it counts CODE lines (blank and
 * comment-only lines excluded, matching the backend rule's semantics) for
 * every source file under app/ components/ lib/ and fails if any exceeds the
 * limit.
 *
 * Legacy offenders that predate the gate are grandfathered in ALLOWLIST with a
 * TODO — the same pattern the backend uses for its remaining god-files. Remove
 * an entry once the file is split; do not add new ones.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const DIRS = ['app', 'components', 'lib']
const MAX = 300

// No grandfathered files — every source file must stay under the ceiling.
// If a legacy exception is ever unavoidable, add it here WITH a TODO and split
// it promptly (mirrors the backend's tracked eslint-disable banners).
const ALLOWLIST = new Set([])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full)
  }
  return out
}

function codeLines(text) {
  let inBlock = false
  let count = 0
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (inBlock) {
      if (line.includes('*/')) inBlock = false
      continue
    }
    if (line === '') continue
    if (line.startsWith('//')) continue
    if (line.startsWith('*')) continue
    if (line.startsWith('/*')) {
      if (!line.includes('*/')) inBlock = true
      continue
    }
    count++
  }
  return count
}

const offenders = []
for (const dir of DIRS) {
  let files
  try {
    files = walk(join(ROOT, dir))
  } catch {
    continue
  }
  for (const file of files) {
    const rel = relative(ROOT, file)
    const n = codeLines(readFileSync(file, 'utf8'))
    if (n > MAX && !ALLOWLIST.has(rel)) offenders.push({ rel, n })
  }
}

if (offenders.length) {
  console.error(`\n✖ god-file gate: ${offenders.length} file(s) over ${MAX} code lines:\n`)
  for (const o of offenders.sort((a, b) => b.n - a.n)) {
    console.error(`  ${o.n}  ${o.rel}`)
  }
  console.error('\nSplit the file into smaller modules (see components/admin/form-controls.tsx + folder splits for the pattern).\n')
  process.exit(1)
}

console.log(`✓ god-file gate: all frontend source files within ${MAX} code lines.`)
