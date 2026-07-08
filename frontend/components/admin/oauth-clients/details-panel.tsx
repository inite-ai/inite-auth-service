'use client'

import {
  Edit2,
  RefreshCw,
  Copy,
  PlayCircle,
  ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Sheet, Badge } from '@/components/ui'
import { OAuthClient, detectType, typeMeta, formatRelative } from './types'

export function DetailsPanel({
  client,
  onClose,
  onEdit,
  onRotate,
  onTest,
}: {
  client: OAuthClient | null
  onClose: () => void
  onEdit: (client: OAuthClient) => void
  onRotate: (client: OAuthClient) => void
  onTest: (client: OAuthClient) => void
}) {
  if (!client) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        <></>
      </Sheet>
    )
  }

  const type = detectType(client.allowedGrants)
  const isM2M = client.allowedGrants?.includes('client_credentials')

  const copyId = () => {
    navigator.clipboard.writeText(client.clientId)
    toast.success('Client ID copied')
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={client.name}
      subtitle={client.clientId}
      width="md"
      footer={
        <div className="flex justify-end gap-2">
          {isM2M && (
            <button
              type="button"
              onClick={() => onTest(client)}
              className="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--bg-overlay)]"
            >
              <PlayCircle className="w-3.5 h-3.5" />
              Test token
            </button>
          )}
          <button
            type="button"
            onClick={() => onRotate(client)}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md text-[var(--text)] border border-[var(--border-strong)] hover:bg-[var(--bg-overlay)]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Rotate secret
          </button>
          <button
            type="button"
            onClick={() => onEdit(client)}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Identity */}
        <div className="flex items-center gap-3">
          <Badge variant={typeMeta[type].color}>{typeMeta[type].label}</Badge>
          {client.active ? (
            <Badge variant="success">Active</Badge>
          ) : (
            <Badge variant="neutral">Inactive</Badge>
          )}
        </div>

        <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)]">
              Client ID
            </div>
            <button
              type="button"
              onClick={copyId}
              className="text-[var(--text-faint)] hover:text-[var(--text)] transition-colors"
              aria-label="Copy"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-1 text-sm font-mono text-[var(--text)] break-all">
            {client.clientId}
          </div>
        </div>

        {client.stats && (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Auth codes" value={client.stats.totalAuthCodes} />
            <Stat label="Total tokens" value={client.stats.totalTokens} />
            <Stat
              label="Active tokens"
              value={client.stats.activeTokens}
              accent
            />
          </div>
        )}

        <Section title="Grant types">
          <div className="flex flex-wrap gap-1">
            {(client.allowedGrants ?? []).map((g) => (
              <Badge key={g} variant="mono" mono>
                {g}
              </Badge>
            ))}
            {(!client.allowedGrants || client.allowedGrants.length === 0) && (
              <span className="text-[11px] text-[var(--text-faint)]">
                none configured
              </span>
            )}
          </div>
        </Section>

        <Section title="Token-endpoint auth">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant={
                client.tokenEndpointAuthMethod === 'private_key_jwt'
                  ? 'accent'
                  : client.isPublic
                    ? 'warning'
                    : 'neutral'
              }
              mono
            >
              {client.tokenEndpointAuthMethod ??
                (client.isPublic ? 'none' : 'client_secret_post')}
            </Badge>
            {client.jwksUri && (
              <span className="text-[11px] font-mono text-[var(--text-muted)] break-all">
                {client.jwksUri}
              </span>
            )}
            {!client.jwksUri &&
              client.jwks != null &&
              Array.isArray((client.jwks as any).keys) && (
                <span className="text-[11px] text-[var(--text-muted)]">
                  inline JWKS · {(client.jwks as any).keys.length} key
                  {(client.jwks as any).keys.length === 1 ? '' : 's'}
                </span>
              )}
          </div>
        </Section>

        <Section title="Allowed scopes">
          <div className="flex flex-wrap gap-1">
            {(client.allowedScopes ?? []).map((s) => (
              <Badge key={s} variant="accent" mono>
                {s}
              </Badge>
            ))}
          </div>
        </Section>

        {client.companyId && (
          <Section title="Company ID (M2M sub)">
            <code className="text-xs font-mono text-[var(--text)]">
              {client.companyId}
            </code>
          </Section>
        )}

        {(client.allowedAudiences ?? []).length > 0 && (
          <Section title="Allowed audiences (M2M aud)">
            <div className="flex flex-wrap gap-1">
              {client.allowedAudiences!.map((a) => (
                <Badge key={a} variant="warning" mono>
                  {a}
                </Badge>
              ))}
            </div>
          </Section>
        )}

        {(client.redirectUris ?? []).length > 0 && (
          <Section title="Redirect URIs">
            <div className="space-y-1">
              {client.redirectUris!.map((uri, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 text-xs font-mono text-[var(--text)] bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 break-all"
                >
                  <ExternalLink className="w-3 h-3 text-[var(--text-faint)] shrink-0" />
                  {uri}
                </div>
              ))}
            </div>
          </Section>
        )}

        {client.backchannelLogoutUri && (
          <Section title="Back-channel logout URI">
            <code className="block text-xs font-mono text-[var(--text)] bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 break-all">
              {client.backchannelLogoutUri}
            </code>
          </Section>
        )}

        <Section title="Created">
          <p className="text-sm text-[var(--text)]">
            {new Date(client.createdAt).toLocaleString()}
            <span className="ml-2 text-xs text-[var(--text-muted)]">
              ({formatRelative(client.createdAt)})
            </span>
          </p>
        </Section>
      </div>
    </Sheet>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-[var(--text-faint)] mb-1.5">
        {title}
      </div>
      {children}
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: number
  accent?: boolean
}) {
  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md p-3 text-center">
      <div
        className={`text-lg font-semibold ${
          accent ? 'text-[var(--accent)]' : 'text-[var(--text)]'
        }`}
      >
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--text-faint)] mt-0.5">
        {label}
      </div>
    </div>
  )
}
