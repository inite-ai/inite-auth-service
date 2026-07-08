'use client'

import {
  Edit2,
  Trash2,
  RefreshCw,
  PlayCircle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
} from 'lucide-react'
import { Badge } from '@/components/ui'
import {
  OAuthClient,
  SortKey,
  SortDir,
  detectType,
  typeMeta,
  formatRelative,
} from './types'

export function ClientsTable({
  clients,
  sortKey,
  sortDir,
  onToggleSort,
  onOpenDetails,
  onEdit,
  onTest,
  onRotate,
  onDelete,
}: {
  clients: OAuthClient[]
  sortKey: SortKey
  sortDir: SortDir
  onToggleSort: (key: SortKey) => void
  onOpenDetails: (client: OAuthClient) => void
  onEdit: (client: OAuthClient) => void
  onTest: (client: OAuthClient) => void
  onRotate: (client: OAuthClient) => void
  onDelete: (client: OAuthClient) => void
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
            <Th
              label="Client"
              sortKey="name"
              activeKey={sortKey}
              dir={sortDir}
              onClick={onToggleSort}
            />
            <Th
              label="Type"
              sortKey="type"
              activeKey={sortKey}
              dir={sortDir}
              onClick={onToggleSort}
            />
            <th className="px-3 py-2 font-medium">Scopes / aud</th>
            <Th
              label="Status"
              sortKey="status"
              activeKey={sortKey}
              dir={sortDir}
              onClick={onToggleSort}
            />
            <Th
              label="Created"
              sortKey="created"
              activeKey={sortKey}
              dir={sortDir}
              onClick={onToggleSort}
            />
            <th className="px-3 py-2 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((client) => {
            const type = detectType(client.allowedGrants)
            const meta = typeMeta[type]
            const TypeIcon = meta.icon
            const isM2M = type === 'm2m' || type === 'hybrid'
            return (
              <tr
                key={client.clientId}
                onClick={() => onOpenDetails(client)}
                className="border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--bg-overlay)]/60 cursor-pointer transition-colors"
              >
                <td className="px-3 py-2.5 min-w-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 h-7 rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center text-[var(--text-muted)] shrink-0">
                      {client.logoUrl ? (
                        <img
                          src={client.logoUrl}
                          alt=""
                          className="w-full h-full rounded-md object-cover"
                        />
                      ) : (
                        <TypeIcon className="w-3.5 h-3.5" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[var(--text)] truncate">
                        {client.name}
                      </div>
                      <div className="text-[11px] text-[var(--text-faint)] font-mono truncate">
                        {client.clientId}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <Badge variant={meta.color} icon={<TypeIcon className="w-3 h-3" />}>
                    {meta.label}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <span>
                      {(client.allowedScopes ?? []).length} scope
                      {(client.allowedScopes ?? []).length === 1 ? '' : 's'}
                    </span>
                    {isM2M && (client.allowedAudiences?.length ?? 0) > 0 && (
                      <>
                        <span className="text-[var(--text-faint)]">·</span>
                        <span className="font-mono text-[var(--text)] truncate max-w-[140px]">
                          {client.allowedAudiences!.join(', ')}
                        </span>
                      </>
                    )}
                    {!isM2M && (client.redirectUris?.length ?? 0) > 0 && (
                      <>
                        <span className="text-[var(--text-faint)]">·</span>
                        <span>
                          {client.redirectUris!.length} redirect
                          {client.redirectUris!.length === 1 ? '' : 's'}
                        </span>
                      </>
                    )}
                    {client.companyId && (
                      <>
                        <span className="text-[var(--text-faint)]">·</span>
                        <span className="font-mono truncate max-w-[120px]">
                          {client.companyId}
                        </span>
                      </>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {client.active ? (
                    <Badge variant="success">Active</Badge>
                  ) : (
                    <Badge variant="neutral">Inactive</Badge>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[11px] text-[var(--text-muted)] whitespace-nowrap">
                  {formatRelative(client.createdAt)}
                </td>
                <td
                  className="px-3 py-2.5 text-right whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex items-center gap-0.5">
                    <IconButton
                      title="Edit"
                      onClick={() => onEdit(client)}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </IconButton>
                    {(client.allowedGrants ?? []).includes('client_credentials') && (
                      <IconButton
                        title="Test M2M token"
                        onClick={() => onTest(client)}
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                      </IconButton>
                    )}
                    <IconButton
                      title="Rotate secret"
                      onClick={() => onRotate(client)}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </IconButton>
                    <IconButton
                      title="Delete"
                      variant="danger"
                      onClick={() => onDelete(client)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Th({
  label,
  sortKey,
  activeKey,
  dir,
  onClick,
}: {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  dir: SortDir
  onClick: (key: SortKey) => void
}) {
  const active = sortKey === activeKey
  const Arrow = active
    ? dir === 'asc'
      ? ChevronUp
      : ChevronDown
    : ChevronsUpDown
  return (
    <th className="px-3 py-2 font-medium">
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-[var(--text)] transition-colors ${
          active ? 'text-[var(--text)]' : ''
        }`}
      >
        {label}
        <Arrow className="w-3 h-3" />
      </button>
    </th>
  )
}

function IconButton({
  title,
  onClick,
  children,
  variant = 'default',
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  variant?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-1.5 rounded-md text-[var(--text-faint)] hover:bg-[var(--bg-overlay)] transition-colors ${
        variant === 'danger'
          ? 'hover:text-[color:var(--danger)]'
          : 'hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  )
}
