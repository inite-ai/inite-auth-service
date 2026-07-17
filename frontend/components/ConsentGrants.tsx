'use client'

import { AlertTriangle, Bot, Wrench } from 'lucide-react'
import type { ParsedAuthorizationDetail } from '@/lib/oauthHelpers'

/**
 * RFC 9396 grant rendering for the consent page. The MCP grant type
 * (inite_mcp_resource) gets a human-readable per-tool permission list —
 * this is what an AI agent will and will not be able to do — while other
 * types fall back to a collapsed raw view. Malformed JSON renders a
 * warning; the consent page then drops the parameter instead of
 * forwarding garbage the backend would reject.
 */

const MCP_TYPE = 'inite_mcp_resource'

// Human labels for known brain MCP actions. Unknown actions render
// verbatim in mono — visible, never hidden.
const ACTION_LABELS: Record<string, string> = {
  read: 'Read access (all read tools)',
  write: 'Write access (all write tools)',
  search_knowledge: 'Search the memory',
  synthesize_answer: 'Synthesize answers from memory',
  get_entity_profile: 'Read entity profiles',
  get_entity_timeline: 'Read entity timelines',
  record_fact: 'Record new facts',
  retract_fact: 'Retract facts',
  detect_contradiction: 'Preflight contradiction checks',
}

export function ConsentGrants({
  details,
  malformed,
}: {
  details: ParsedAuthorizationDetail[] | null
  malformed: boolean
}) {
  if (malformed) {
    return (
      <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          The app sent unreadable fine-grained permissions
          (authorization_details). They were ignored — only the scopes above
          will be granted.
        </p>
      </div>
    )
  }
  if (!details || details.length === 0) return null

  const mcp = details.filter((d) => d.type === MCP_TYPE)
  const other = details.filter((d) => d.type !== MCP_TYPE)

  return (
    <div className="mb-6">
      {mcp.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Bot className="w-4 h-4 text-purple-500" />
            Agent tool permissions
          </h3>
          <ul className="space-y-2 mb-3">
            {mcp.flatMap((d, i) =>
              (d.actions ?? []).map((action) => (
                <li
                  key={`${i}:${action}`}
                  className="flex items-center gap-3 text-gray-600 dark:text-gray-400"
                >
                  <Wrench className="w-4 h-4 text-purple-500 flex-shrink-0" />
                  <span className="text-sm">
                    {ACTION_LABELS[action] ?? (
                      <code className="font-mono text-xs">{action}</code>
                    )}
                  </span>
                </li>
              )),
            )}
          </ul>
          {mcp.some((d) => d.locations?.length) && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-2">
              Applies to:{' '}
              {mcp.flatMap((d) => d.locations ?? []).join(', ')}
            </p>
          )}
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Tools outside this list stay unavailable to the app even within
            the scopes above.
          </p>
        </>
      )}
      {other.length > 0 && (
        <details className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          <summary className="cursor-pointer">
            Additional requested permissions ({other.length})
          </summary>
          <pre className="mt-2 p-2 rounded bg-gray-50 dark:bg-gray-800 overflow-x-auto text-[11px]">
            {JSON.stringify(other, null, 2)}
          </pre>
        </details>
      )}
    </div>
  )
}
