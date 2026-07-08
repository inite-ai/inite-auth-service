'use client'

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  ChangeEvent,
} from 'react'
import {
  AppWindow,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  Check,
  X,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Search,
  Server,
  Globe,
  Cpu,
  Code2,
  PlayCircle,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Inbox,
  KeyRound,
  ExternalLink,
  Terminal,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import {
  Sheet,
  Badge,
  ConfirmDialog,
  SkeletonRow,
} from '@/components/ui'

interface OAuthClient {
  clientId: string
  name: string
  redirectUris: string[]
  allowedScopes: string[]
  allowedGrants: string[]
  allowedAudiences: string[]
  companyId?: string | null
  backchannelLogoutUri?: string | null
  active: boolean
  logoUrl?: string | null
  tokenEndpointAuthMethod?: string | null
  jwks?: unknown
  jwksUri?: string | null
  isPublic?: boolean
  createdAt: string
  updatedAt?: string
  // Loaded on demand for the details panel.
  stats?: {
    totalAuthCodes: number
    totalTokens: number
    activeTokens: number
  }
}

interface OAuthClientsSectionProps {
  accessToken: string
}

// What flavour of client are we looking at? Derived from allowedGrants
// — drives the icon, the badge, and the filter chip.
type ClientType = 'web' | 'm2m' | 'device' | 'hybrid' | 'unknown'

function detectType(grants: string[] = []): ClientType {
  const hasAuth = grants.includes('authorization_code')
  const hasRefresh = grants.includes('refresh_token')
  const hasCc = grants.includes('client_credentials')
  const hasDevice = grants.includes(
    'urn:ietf:params:oauth:grant-type:device_code',
  )
  const userFlow = hasAuth || hasRefresh
  const flavors = [
    userFlow && !hasCc && !hasDevice,
    hasCc && !userFlow && !hasDevice,
    hasDevice && !userFlow && !hasCc,
  ]
  if (flavors.filter(Boolean).length === 1) {
    if (flavors[0]) return 'web'
    if (flavors[1]) return 'm2m'
    if (flavors[2]) return 'device'
  }
  if (!grants.length) return 'unknown'
  return 'hybrid'
}

const typeMeta: Record<
  ClientType,
  { label: string; icon: typeof AppWindow; color: 'accent' | 'success' | 'warning' | 'neutral' }
> = {
  web: { label: 'Web app', icon: Globe, color: 'accent' },
  m2m: { label: 'M2M', icon: Server, color: 'success' },
  device: { label: 'Device', icon: Cpu, color: 'warning' },
  hybrid: { label: 'Hybrid', icon: AppWindow, color: 'neutral' },
  unknown: { label: '—', icon: AppWindow, color: 'neutral' },
}

const GRANT_OPTIONS: Array<{ id: string; label: string; hint: string }> = [
  { id: 'authorization_code', label: 'Authorization Code', hint: 'User-flow apps with PKCE' },
  { id: 'refresh_token', label: 'Refresh Token', hint: 'Long-lived sessions' },
  { id: 'client_credentials', label: 'Client Credentials', hint: 'Service-to-service M2M, no user' },
  {
    id: 'urn:ietf:params:oauth:grant-type:device_code',
    label: 'Device Code',
    hint: 'TV / CLI / IoT — user authorises on a second device',
  },
]

const SCOPE_PRESETS = [
  'openid', 'profile', 'email', 'offline_access', 'wallet', 'admin',
  'brain:read', 'brain:write', 'brain:admin', 'brain:read_pii',
]

const AUDIENCE_PRESETS = ['brain', 'inbox', 'assistant', 'admin-panel']

type SortKey = 'name' | 'type' | 'scopes' | 'status' | 'created'
type SortDir = 'asc' | 'desc'

type TypeFilter = 'all' | ClientType
type StatusFilter = 'all' | 'active' | 'inactive'

function formatRelative(iso: string): string {
  const ts = new Date(iso).getTime()
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

function decodeJwtSegment(seg: string): any {
  try {
    const norm = seg.replace(/-/g, '+').replace(/_/g, '/')
    const padded = norm.padEnd(norm.length + ((4 - (norm.length % 4)) % 4), '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

export default function OAuthClientsSection({
  accessToken,
}: OAuthClientsSectionProps) {
  const [clients, setClients] = useState<OAuthClient[]>([])
  const [loading, setLoading] = useState(true)

  // Filters / search / sort
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('created')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Panels & dialogs
  const [creating, setCreating] = useState(false)
  const [editingClient, setEditingClient] = useState<OAuthClient | null>(null)
  const [detailsClient, setDetailsClient] = useState<OAuthClient | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<OAuthClient | null>(null)
  const [rotateTarget, setRotateTarget] = useState<OAuthClient | null>(null)
  const [testTarget, setTestTarget] = useState<OAuthClient | null>(null)
  const [newSecret, setNewSecret] = useState<string | null>(null)

  const config = useMemo(
    () => ({ headers: { Authorization: `Bearer ${accessToken}` } }),
    [accessToken],
  )

  const loadClients = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/oauth-clients', config)
      setClients(res.data as OAuthClient[])
    } catch {
      toast.error('Failed to load OAuth clients')
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  // ============== filters + sort ==============
  const visibleClients = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = clients.filter((c) => {
      if (typeFilter !== 'all' && detectType(c.allowedGrants) !== typeFilter) {
        return false
      }
      if (statusFilter === 'active' && !c.active) return false
      if (statusFilter === 'inactive' && c.active) return false
      if (!q) return true
      const haystack = [
        c.name,
        c.clientId,
        c.companyId ?? '',
        (c.allowedAudiences ?? []).join(' '),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })

    const dirMult = sortDir === 'asc' ? 1 : -1
    out = [...out].sort((a, b) => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name) * dirMult
        case 'type':
          return (
            typeMeta[detectType(a.allowedGrants)].label.localeCompare(
              typeMeta[detectType(b.allowedGrants)].label,
            ) * dirMult
          )
        case 'scopes':
          return ((a.allowedScopes?.length ?? 0) - (b.allowedScopes?.length ?? 0)) * dirMult
        case 'status':
          return (Number(a.active) - Number(b.active)) * dirMult
        case 'created':
        default:
          return (
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) *
            dirMult
          )
      }
    })
    return out
  }, [clients, search, typeFilter, statusFilter, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'created' ? 'desc' : 'asc')
    }
  }

  const openDetails = async (client: OAuthClient) => {
    setDetailsClient(client)
    // Refresh with stats.
    try {
      const res = await api.get(`/admin/oauth-clients/${client.clientId}`, config)
      setDetailsClient(res.data as OAuthClient)
    } catch {
      // keep the lightweight version if the call fails
    }
  }

  const deleteClient = async () => {
    if (!deleteConfirm) return
    try {
      await api.delete(
        `/admin/oauth-clients/${deleteConfirm.clientId}`,
        config,
      )
      toast.success('Client deleted')
      setDeleteConfirm(null)
      setDetailsClient(null)
      setEditingClient(null)
      loadClients()
    } catch {
      toast.error('Failed to delete client')
    }
  }

  // ============== filter chip counts ==============
  const counts = useMemo(() => {
    const byType: Record<TypeFilter, number> = {
      all: clients.length,
      web: 0,
      m2m: 0,
      device: 0,
      hybrid: 0,
      unknown: 0,
    }
    let active = 0
    for (const c of clients) {
      byType[detectType(c.allowedGrants)]++
      if (c.active) active++
    }
    return { byType, active, inactive: clients.length - active }
  }, [clients])

  return (
    <div className="space-y-4">
      {/* Header — title comes from parent page heading; this strip is
          purely the toolbar: filters left, new-client button right. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-faint)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, id, tenant…"
              className="h-8 pl-8 pr-3 w-56 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40"
            />
          </div>

          {/* Type chips */}
          <FilterChipGroup
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as TypeFilter)}
            options={[
              { value: 'all', label: 'All', count: counts.byType.all },
              { value: 'web', label: 'Web', count: counts.byType.web },
              { value: 'm2m', label: 'M2M', count: counts.byType.m2m },
              { value: 'device', label: 'Device', count: counts.byType.device },
            ]}
          />

          {/* Status chips */}
          <FilterChipGroup
            value={statusFilter}
            onChange={(v) => setStatusFilter(v as StatusFilter)}
            options={[
              { value: 'all', label: 'Any', count: clients.length },
              { value: 'active', label: 'Active', count: counts.active },
              {
                value: 'inactive',
                label: 'Inactive',
                count: counts.inactive,
              },
            ]}
          />
        </div>

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          New client
        </button>
      </div>

      {/* Result count + active filters summary */}
      <div className="text-xs text-[var(--text-muted)]">
        {loading
          ? 'Loading…'
          : `${visibleClients.length} of ${clients.length} clients`}
      </div>

      {/* Table */}
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2">
            {[...Array(5)].map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : visibleClients.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="w-7 h-7 mx-auto text-[var(--text-faint)] mb-3" />
            <p className="text-sm font-medium text-[var(--text)]">
              {clients.length === 0 ? 'No OAuth clients yet' : 'No clients match these filters'}
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {clients.length === 0
                ? 'Register your first app or service to start issuing tokens.'
                : 'Try a different filter or clear the search box.'}
            </p>
            {clients.length === 0 && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="mt-4 h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
              >
                <Plus className="w-3.5 h-3.5" />
                New client
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                  <Th
                    label="Client"
                    sortKey="name"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <Th
                    label="Type"
                    sortKey="type"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <th className="px-3 py-2 font-medium">Scopes / aud</th>
                  <Th
                    label="Status"
                    sortKey="status"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <Th
                    label="Created"
                    sortKey="created"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={toggleSort}
                  />
                  <th className="px-3 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleClients.map((client) => {
                  const type = detectType(client.allowedGrants)
                  const meta = typeMeta[type]
                  const TypeIcon = meta.icon
                  const isM2M = type === 'm2m' || type === 'hybrid'
                  return (
                    <tr
                      key={client.clientId}
                      onClick={() => openDetails(client)}
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
                            onClick={() => setEditingClient(client)}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </IconButton>
                          {(client.allowedGrants ?? []).includes('client_credentials') && (
                            <IconButton
                              title="Test M2M token"
                              onClick={() => setTestTarget(client)}
                            >
                              <PlayCircle className="w-3.5 h-3.5" />
                            </IconButton>
                          )}
                          <IconButton
                            title="Rotate secret"
                            onClick={() => setRotateTarget(client)}
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </IconButton>
                          <IconButton
                            title="Delete"
                            variant="danger"
                            onClick={() => setDeleteConfirm(client)}
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
        )}
      </div>

      {/* Create — side panel */}
      <CreateClientPanel
        open={creating}
        onClose={() => setCreating(false)}
        config={config}
        onCreated={(secret) => {
          setNewSecret(secret)
          setCreating(false)
          loadClients()
        }}
      />

      {/* Edit — side panel */}
      <EditClientPanel
        client={editingClient}
        onClose={() => setEditingClient(null)}
        config={config}
        onSaved={() => {
          setEditingClient(null)
          loadClients()
        }}
        onDelete={(client) => setDeleteConfirm(client)}
      />

      {/* Details — side panel */}
      <DetailsPanel
        client={detailsClient}
        onClose={() => setDetailsClient(null)}
        onEdit={(client) => {
          setDetailsClient(null)
          setEditingClient(client)
        }}
        onRotate={(client) => {
          setDetailsClient(null)
          setRotateTarget(client)
        }}
        onTest={(client) => {
          setDetailsClient(null)
          setTestTarget(client)
        }}
      />

      {/* Rotate — side panel (multi-input) */}
      <RotateSecretPanel
        client={rotateTarget}
        onClose={() => setRotateTarget(null)}
        config={config}
        onRotated={(secret) => {
          setNewSecret(secret)
          setRotateTarget(null)
        }}
      />

      {/* Test M2M token — side panel */}
      <TestTokenPanel
        client={testTarget}
        onClose={() => setTestTarget(null)}
        config={config}
      />

      {/* New secret reveal — small modal (one-shot) */}
      <NewSecretDialog
        secret={newSecret}
        onClose={() => setNewSecret(null)}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteConfirm}
        intent="danger"
        title={`Delete ${deleteConfirm?.name ?? 'client'}?`}
        description={
          <span>
            This permanently revokes all tokens and deletes the OAuth client{' '}
            <code className="font-mono text-[var(--text)]">
              {deleteConfirm?.clientId}
            </code>
            . This action cannot be undone.
          </span>
        }
        confirmLabel="Delete client"
        onConfirm={deleteClient}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  )
}

// ===== shared UI bits =====

interface ChipOption {
  value: string
  label: string
  count?: number
}

function FilterChipGroup({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: ChipOption[]
}) {
  return (
    <div className="inline-flex p-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md">
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`h-7 px-2.5 inline-flex items-center gap-1.5 text-xs rounded transition-colors ${
              active
                ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                : 'text-[var(--text-muted)] hover:text-[var(--text)]'
            }`}
          >
            {o.label}
            {typeof o.count === 'number' && (
              <span
                className={`text-[10px] font-mono ${
                  active ? 'text-[var(--text-muted)]' : 'text-[var(--text-faint)]'
                }`}
              >
                {o.count}
              </span>
            )}
          </button>
        )
      })}
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

// ===== reusable form bits =====

function FieldLabel({
  label,
  hint,
}: {
  label: string
  hint?: string
}) {
  return (
    <label className="block text-xs font-medium text-[var(--text-muted)] mb-1.5">
      {label}
      {hint && (
        <span className="ml-2 text-[var(--text-faint)] font-normal">
          {hint}
        </span>
      )}
    </label>
  )
}

function TextField({
  value,
  onChange,
  placeholder,
  mono = false,
  type = 'text',
}: {
  value: string
  onChange: (e: ChangeEvent<HTMLInputElement>) => void
  placeholder?: string
  mono?: boolean
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full h-9 px-3 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 ${
        mono ? 'font-mono' : ''
      }`}
    />
  )
}

function GrantPicker({
  selected,
  onToggle,
}: {
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="space-y-1.5">
      {GRANT_OPTIONS.map((g) => {
        const checked = selected.includes(g.id)
        return (
          <button
            type="button"
            key={g.id}
            onClick={() => onToggle(g.id)}
            className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-md border text-left transition-colors ${
              checked
                ? 'bg-[var(--accent-faint)] border-[color:var(--accent)]/40'
                : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border-strong)]'
            }`}
          >
            <div
              className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                checked
                  ? 'bg-[var(--accent)] border-[var(--accent)]'
                  : 'border-[var(--border-strong)]'
              }`}
            >
              {checked && <Check className="w-3 h-3 text-white" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-mono text-[var(--text)]">{g.id}</div>
              <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                {g.hint}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function ChipInput({
  values,
  onChange,
  presets,
  placeholder,
  variant = 'accent',
}: {
  values: string[]
  onChange: (next: string[]) => void
  presets?: string[]
  placeholder?: string
  variant?: 'accent' | 'warning'
}) {
  const [input, setInput] = useState('')
  const add = (raw: string) => {
    const v = raw.trim()
    if (!v || values.includes(v)) return
    onChange([...values, v])
  }
  const remove = (v: string) => onChange(values.filter((x) => x !== v))

  return (
    <div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {values.map((v) => (
            <Badge key={v} variant={variant} mono>
              {v}
              <button
                type="button"
                onClick={() => remove(v)}
                aria-label={`Remove ${v}`}
                className="hover:text-[var(--text)] -mr-0.5"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
              e.preventDefault()
              add(input)
              setInput('')
            }
          }}
          placeholder={placeholder}
          className="flex-1 h-8 px-2.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 font-mono"
        />
        <button
          type="button"
          onClick={() => {
            add(input)
            setInput('')
          }}
          className="h-8 px-2.5 text-xs rounded-md bg-[var(--bg-overlay)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
        >
          Add
        </button>
      </div>
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {presets
            .filter((p) => !values.includes(p))
            .map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => add(p)}
                className="px-1.5 py-0.5 text-[10px] text-[var(--text-faint)] hover:text-[var(--text)] hover:bg-[var(--bg-overlay)] rounded border border-[var(--border)] hover:border-[var(--border-strong)] transition-colors font-mono"
              >
                + {p}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

function RedirectUris({
  values,
  onChange,
}: {
  values: string[]
  onChange: (next: string[]) => void
}) {
  return (
    <div className="space-y-1.5">
      {values.map((uri, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="url"
            value={uri}
            onChange={(e) => {
              const next = [...values]
              next[i] = e.target.value
              onChange(next)
            }}
            placeholder="https://app.example.com/callback"
            className="flex-1 h-8 px-2.5 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40 font-mono"
          />
          <button
            type="button"
            onClick={() => onChange(values.filter((_, idx) => idx !== i))}
            className="p-1.5 text-[var(--text-faint)] hover:text-[color:var(--danger)] rounded-md transition-colors"
            aria-label="Remove URI"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...values, ''])}
        className="text-[11px] text-[var(--accent)] hover:text-[var(--accent-hover)] inline-flex items-center gap-1"
      >
        <Plus className="w-3 h-3" />
        Add URI
      </button>
    </div>
  )
}

// ===== token-endpoint auth method (RFC 7591 private_key_jwt) =====

type AuthMethod = 'client_secret_post' | 'private_key_jwt' | 'none'

interface AuthMethodValue {
  method: AuthMethod
  jwksMode: 'url' | 'paste'
  jwksUri: string
  jwksText: string
}

const AUTH_METHODS: Array<{ id: AuthMethod; label: string; hint: string }> = [
  { id: 'client_secret_post', label: 'Client secret', hint: 'Confidential client authenticates with a shared secret.' },
  { id: 'private_key_jwt', label: 'private_key_jwt', hint: 'Client signs a JWT assertion with its private key; we hold only the public JWKS.' },
  { id: 'none', label: 'Public (none)', hint: 'No client authentication — public client, must use PKCE.' },
]

function defaultAuthValue(): AuthMethodValue {
  return { method: 'client_secret_post', jwksMode: 'url', jwksUri: '', jwksText: '' }
}

function authValueFromClient(client: OAuthClient): AuthMethodValue {
  const method: AuthMethod =
    (client.tokenEndpointAuthMethod as AuthMethod | null) ??
    (client.isPublic ? 'none' : 'client_secret_post')
  return {
    method,
    jwksMode: client.jwksUri ? 'url' : 'paste',
    jwksUri: client.jwksUri ?? '',
    jwksText: client.jwks ? JSON.stringify(client.jwks, null, 2) : '',
  }
}

/** Validate + reduce the auth-method fields into the create/update payload. */
function buildAuthPayload(
  v: AuthMethodValue,
): { ok: true; payload: Record<string, unknown> } | { ok: false; error: string } {
  if (v.method !== 'private_key_jwt') {
    return { ok: true, payload: { tokenEndpointAuthMethod: v.method } }
  }
  if (v.jwksMode === 'url') {
    const uri = v.jwksUri.trim()
    if (!/^https:\/\//.test(uri)) return { ok: false, error: 'JWKS URL must be an https URL' }
    return { ok: true, payload: { tokenEndpointAuthMethod: 'private_key_jwt', jwksUri: uri } }
  }
  let parsed: any
  try {
    parsed = JSON.parse(v.jwksText)
  } catch {
    return { ok: false, error: 'JWK Set is not valid JSON' }
  }
  const keys = parsed?.keys
  if (!Array.isArray(keys) || keys.length === 0) {
    return { ok: false, error: 'JWK Set must have a non-empty "keys" array' }
  }
  if (keys.some((k: any) => k && (k.d !== undefined || k.kty === 'oct'))) {
    return { ok: false, error: 'That looks like a private key — paste only public keys (no "d"/oct).' }
  }
  return { ok: true, payload: { tokenEndpointAuthMethod: 'private_key_jwt', jwks: parsed } }
}

function AuthMethodField({
  value,
  onChange,
}: {
  value: AuthMethodValue
  onChange: (next: AuthMethodValue) => void
}) {
  return (
    <div className="rounded-md border border-[var(--border)] p-3 space-y-3">
      <FieldLabel label="Token-endpoint auth method" />
      <div className="inline-flex flex-wrap p-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md">
        {AUTH_METHODS.map((m) => {
          const active = value.method === m.id
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange({ ...value, method: m.id })}
              className={`h-7 px-2.5 text-xs rounded transition-colors ${
                active
                  ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)]'
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">
        {AUTH_METHODS.find((m) => m.id === value.method)?.hint}
      </p>

      {value.method === 'none' && (
        <div className="text-[11px] text-[color:var(--warning)] bg-[color:var(--warning)]/10 border border-[color:var(--warning)]/30 rounded-md px-2.5 py-1.5">
          Public client — no secret is used. Only register this for apps that
          cannot keep a secret (SPA/native) and always use PKCE.
        </div>
      )}

      {value.method === 'private_key_jwt' && (
        <div className="space-y-2">
          <div className="inline-flex p-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md">
            {(['url', 'paste'] as const).map((mode) => {
              const active = value.jwksMode === mode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onChange({ ...value, jwksMode: mode })}
                  className={`h-7 px-2.5 text-xs rounded transition-colors ${
                    active
                      ? 'bg-[var(--bg-overlay)] text-[var(--text)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
                >
                  {mode === 'url' ? 'JWKS URL' : 'Paste JWK Set'}
                </button>
              )
            })}
          </div>
          {value.jwksMode === 'url' ? (
            <TextField
              mono
              value={value.jwksUri}
              onChange={(e) => onChange({ ...value, jwksUri: e.target.value })}
              placeholder="https://client.example.com/.well-known/jwks.json"
            />
          ) : (
            <textarea
              value={value.jwksText}
              onChange={(e) => onChange({ ...value, jwksText: e.target.value })}
              placeholder='{ "keys": [ { "kty": "RSA", "n": "…", "e": "AQAB", "use": "sig" } ] }'
              rows={6}
              className="w-full px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-xs font-mono text-[var(--text)] placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40"
            />
          )}
          <p className="text-[11px] text-[var(--text-faint)]">
            Only public keys are accepted — a JWK with a private component
            (<code className="font-mono">d</code> / <code className="font-mono">oct</code>) is rejected.
          </p>
        </div>
      )}
    </div>
  )
}

// ===== Create panel =====

interface CreateForm {
  name: string
  clientId: string
  redirectUris: string[]
  allowedScopes: string[]
  allowedGrants: string[]
  allowedAudiences: string[]
  companyId: string
  backchannelLogoutUri: string
  auth: AuthMethodValue
}

function CreateClientPanel({
  open,
  onClose,
  config,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  config: any
  onCreated: (secret: string) => void
}) {
  const [form, setForm] = useState<CreateForm>(initialCreateForm())
  const [saving, setSaving] = useState(false)

  // Reset when re-opened.
  useEffect(() => {
    if (open) setForm(initialCreateForm())
  }, [open])

  const wantsRedirect =
    form.allowedGrants.includes('authorization_code') ||
    form.allowedGrants.includes('refresh_token')
  const wantsM2M = form.allowedGrants.includes('client_credentials')

  const submit = async () => {
    if (!form.name.trim() || !form.clientId.trim()) {
      toast.error('Name and Client ID are required')
      return
    }
    if (form.allowedGrants.length === 0) {
      toast.error('Pick at least one grant type')
      return
    }
    if (form.allowedScopes.length === 0) {
      toast.error('Pick at least one scope')
      return
    }
    if (wantsRedirect && form.redirectUris.filter(Boolean).length === 0) {
      toast.error('Authorization code grant requires at least one redirect URI')
      return
    }
    if (wantsM2M && form.allowedAudiences.length === 0) {
      toast(
        'No explicit audiences — tokens will default to clientId as aud.',
        { icon: '⚠️' },
      )
    }
    const auth = buildAuthPayload(form.auth)
    if (!auth.ok) {
      toast.error(auth.error)
      return
    }
    setSaving(true)
    try {
      const res = await api.post(
        '/admin/oauth-clients',
        {
          name: form.name.trim(),
          clientId: form.clientId.trim(),
          redirectUris: form.redirectUris.filter(Boolean),
          allowedScopes: form.allowedScopes,
          allowedGrants: form.allowedGrants,
          companyId: form.companyId.trim() || null,
          allowedAudiences: form.allowedAudiences,
          backchannelLogoutUri: form.backchannelLogoutUri.trim() || null,
          ...auth.payload,
        },
        config,
      )
      toast.success('OAuth client created')
      onCreated(res.data.clientSecret)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to create client')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet
      open={open}
      onClose={() => !saving && onClose()}
      title="New OAuth client"
      width="lg"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-8 px-3 text-xs rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Create client
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel label="Application name" />
            <TextField
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="My App"
            />
          </div>
          <div>
            <FieldLabel label="Client ID" />
            <TextField
              mono
              value={form.clientId}
              onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              placeholder="my-app"
            />
          </div>
        </div>

        <div>
          <FieldLabel label="Grant types" />
          <GrantPicker
            selected={form.allowedGrants}
            onToggle={(id) => {
              const set = new Set(form.allowedGrants)
              set.has(id) ? set.delete(id) : set.add(id)
              setForm({ ...form, allowedGrants: Array.from(set) })
            }}
          />
        </div>

        {wantsRedirect && (
          <div>
            <FieldLabel label="Redirect URIs" hint="must exact-match at /oauth/authorize" />
            <RedirectUris
              values={form.redirectUris}
              onChange={(v) => setForm({ ...form, redirectUris: v })}
            />
          </div>
        )}

        {wantsRedirect && (
          <div>
            <FieldLabel
              label="Back-channel logout URI"
              hint="optional · OIDC logout_token target"
            />
            <TextField
              mono
              value={form.backchannelLogoutUri}
              onChange={(e) =>
                setForm({ ...form, backchannelLogoutUri: e.target.value })
              }
              placeholder="https://app.example.com/oidc/logout"
            />
          </div>
        )}

        {wantsM2M && (
          <>
            <div>
              <FieldLabel
                label="Company ID"
                hint="optional · embedded as JWT sub"
              />
              <TextField
                mono
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                placeholder="co_acme"
              />
            </div>
            <div>
              <FieldLabel
                label="Allowed audiences"
                hint="which services this M2M client can call"
              />
              <ChipInput
                values={form.allowedAudiences}
                onChange={(v) => setForm({ ...form, allowedAudiences: v })}
                presets={AUDIENCE_PRESETS}
                placeholder="brain · inbox · …"
                variant="warning"
              />
            </div>
          </>
        )}

        <div>
          <FieldLabel label="Allowed scopes" />
          <ChipInput
            values={form.allowedScopes}
            onChange={(v) => setForm({ ...form, allowedScopes: v })}
            presets={SCOPE_PRESETS}
            placeholder="custom:scope and press Enter"
          />
        </div>

        <AuthMethodField
          value={form.auth}
          onChange={(auth) => setForm({ ...form, auth })}
        />
      </div>
    </Sheet>
  )
}

function initialCreateForm(): CreateForm {
  return {
    name: '',
    clientId: '',
    redirectUris: [''],
    allowedScopes: ['openid', 'profile', 'email'],
    allowedGrants: ['authorization_code', 'refresh_token'],
    allowedAudiences: [],
    companyId: '',
    backchannelLogoutUri: '',
    auth: defaultAuthValue(),
  }
}

// ===== Edit panel =====

interface EditForm {
  name: string
  redirectUris: string[]
  allowedScopes: string[]
  allowedGrants: string[]
  allowedAudiences: string[]
  companyId: string
  backchannelLogoutUri: string
  active: boolean
  auth: AuthMethodValue
}

function EditClientPanel({
  client,
  onClose,
  config,
  onSaved,
  onDelete,
}: {
  client: OAuthClient | null
  onClose: () => void
  config: any
  onSaved: () => void
  onDelete: (client: OAuthClient) => void
}) {
  const [form, setForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!client) {
      setForm(null)
      return
    }
    setForm({
      name: client.name ?? '',
      redirectUris: [...(client.redirectUris ?? [])],
      allowedScopes: [...(client.allowedScopes ?? [])],
      allowedGrants: [...(client.allowedGrants ?? [])],
      allowedAudiences: [...(client.allowedAudiences ?? [])],
      companyId: client.companyId ?? '',
      backchannelLogoutUri: client.backchannelLogoutUri ?? '',
      active: client.active !== false,
      auth: authValueFromClient(client),
    })
  }, [client])

  const save = async () => {
    if (!client || !form) return
    if (form.allowedGrants.length === 0) {
      toast.error('Pick at least one grant type')
      return
    }
    if (form.allowedScopes.length === 0) {
      toast.error('Pick at least one scope')
      return
    }
    const auth = buildAuthPayload(form.auth)
    if (!auth.ok) {
      toast.error(auth.error)
      return
    }
    setSaving(true)
    try {
      await api.put(
        `/admin/oauth-clients/${client.clientId}`,
        {
          name: form.name.trim(),
          redirectUris: form.redirectUris.filter(Boolean),
          allowedScopes: form.allowedScopes,
          allowedGrants: form.allowedGrants,
          companyId: form.companyId.trim() || null,
          allowedAudiences: form.allowedAudiences,
          backchannelLogoutUri: form.backchannelLogoutUri.trim() || null,
          active: form.active,
          ...auth.payload,
        },
        config,
      )
      toast.success('Client updated')
      onSaved()
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Failed to update client')
    } finally {
      setSaving(false)
    }
  }

  if (!client || !form) {
    return (
      <Sheet
        open={false}
        onClose={onClose}
        title=""
        footer={null}
      >
        <></>
      </Sheet>
    )
  }

  const wantsRedirect =
    form.allowedGrants.includes('authorization_code') ||
    form.allowedGrants.includes('refresh_token')
  const wantsM2M = form.allowedGrants.includes('client_credentials')

  return (
    <Sheet
      open
      onClose={() => !saving && onClose()}
      title={`Edit ${client.name}`}
      subtitle={client.clientId}
      width="lg"
      footer={
        <div className="flex justify-between items-center gap-2">
          <button
            type="button"
            onClick={() => onDelete(client)}
            disabled={saving}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs rounded-md text-[color:var(--danger)] hover:bg-[color:var(--danger)]/10 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="h-8 px-3 text-xs rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Check className="w-3.5 h-3.5" />
              )}
              Save changes
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <FieldLabel label="Name" />
          <TextField
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div className="flex items-center gap-3 p-3 rounded-md bg-[var(--bg)] border border-[var(--border)]">
          <button
            type="button"
            onClick={() => setForm({ ...form, active: !form.active })}
            className={`relative w-9 h-5 rounded-full transition-colors ${
              form.active ? 'bg-[var(--accent)]' : 'bg-[var(--bg-overlay)]'
            }`}
            aria-label="Toggle active"
          >
            <span
              className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                form.active ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
          <div className="min-w-0">
            <div className="text-xs font-medium text-[var(--text)]">
              {form.active ? 'Active' : 'Inactive'}
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">
              {form.active
                ? 'Issuing tokens. Existing tokens remain valid.'
                : 'Token requests rejected. Existing tokens remain valid until expiry.'}
            </div>
          </div>
        </div>

        <div>
          <FieldLabel label="Grant types" />
          <GrantPicker
            selected={form.allowedGrants}
            onToggle={(id) => {
              const set = new Set(form.allowedGrants)
              set.has(id) ? set.delete(id) : set.add(id)
              setForm({ ...form, allowedGrants: Array.from(set) })
            }}
          />
        </div>

        {wantsRedirect && (
          <div>
            <FieldLabel label="Redirect URIs" />
            <RedirectUris
              values={form.redirectUris}
              onChange={(v) => setForm({ ...form, redirectUris: v })}
            />
          </div>
        )}

        {wantsRedirect && (
          <div>
            <FieldLabel
              label="Back-channel logout URI"
              hint="optional · OIDC logout_token target"
            />
            <TextField
              mono
              value={form.backchannelLogoutUri}
              onChange={(e) =>
                setForm({ ...form, backchannelLogoutUri: e.target.value })
              }
              placeholder="https://app.example.com/oidc/logout"
            />
          </div>
        )}

        {wantsM2M && (
          <>
            <div>
              <FieldLabel
                label="Company ID"
                hint="optional · embedded as JWT sub"
              />
              <TextField
                mono
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel label="Allowed audiences" />
              <ChipInput
                values={form.allowedAudiences}
                onChange={(v) => setForm({ ...form, allowedAudiences: v })}
                presets={AUDIENCE_PRESETS}
                placeholder="brain · inbox · …"
                variant="warning"
              />
            </div>
          </>
        )}

        <div>
          <FieldLabel label="Allowed scopes" />
          <ChipInput
            values={form.allowedScopes}
            onChange={(v) => setForm({ ...form, allowedScopes: v })}
            presets={SCOPE_PRESETS}
          />
        </div>

        <AuthMethodField
          value={form.auth}
          onChange={(auth) => setForm({ ...form, auth })}
        />
      </div>
    </Sheet>
  )
}

// ===== Details panel =====

function DetailsPanel({
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

// ===== Rotate secret panel =====

function RotateSecretPanel({
  client,
  onClose,
  config,
  onRotated,
}: {
  client: OAuthClient | null
  onClose: () => void
  config: any
  onRotated: (secret: string) => void
}) {
  const [force, setForce] = useState(false)
  const [graceHours, setGraceHours] = useState(24)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (client) {
      setForce(false)
      setGraceHours(24)
    }
  }, [client])

  if (!client) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        <></>
      </Sheet>
    )
  }

  const submit = async () => {
    setBusy(true)
    try {
      const body: any = { force }
      if (!force) {
        body.graceWindowSeconds = Math.max(0, Math.min(7 * 24, graceHours)) * 3600
      }
      const res = await api.post(
        `/admin/oauth-clients/${client.clientId}/rotate-secret`,
        body,
        config,
      )
      toast.success(
        force
          ? 'Secret rotated; previous secret revoked immediately'
          : `Secret rotated; previous secret accepted for ${graceHours}h`,
      )
      onRotated(res.data.clientSecret)
    } catch {
      toast.error('Rotation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title="Rotate client secret"
      subtitle={client.clientId}
      width="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-8 px-3 text-xs rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--text)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="h-8 px-3 inline-flex items-center gap-1.5 text-xs font-medium rounded-md bg-[color:var(--warning)] text-black hover:bg-[color:var(--warning)]/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Rotate
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setForce(!force)}
          className={`w-full flex items-start gap-2.5 p-3 rounded-md border text-left transition-colors ${
            force
              ? 'bg-[color:var(--danger)]/10 border-[color:var(--danger)]/40'
              : 'bg-[var(--bg)] border-[var(--border)] hover:border-[var(--border-strong)]'
          }`}
        >
          <div
            className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
              force
                ? 'bg-[color:var(--danger)] border-[color:var(--danger)]'
                : 'border-[var(--border-strong)]'
            }`}
          >
            {force && <Check className="w-3 h-3 text-white" />}
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--text)]">
              Revoke previous secret immediately
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Use when the old secret is known to be compromised. Callers
              using the old secret will start failing right away.
            </div>
          </div>
        </button>

        {!force && (
          <div>
            <FieldLabel
              label={`Grace window: ${graceHours}h`}
              hint="previous secret still works for this long"
            />
            <input
              type="range"
              min={1}
              max={168}
              step={1}
              value={graceHours}
              onChange={(e) => setGraceHours(parseInt(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-faint)] mt-1">
              <span>1h</span>
              <span>24h</span>
              <span>7d</span>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

// ===== Test token panel =====

function TestTokenPanel({
  client,
  onClose,
  config,
}: {
  client: OAuthClient | null
  onClose: () => void
  config: any
}) {
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [scope, setScope] = useState('')
  const [audience, setAudience] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    rawJwt: string
    header: any
    payload: any
    expiresIn: number
    scope: string
  } | null>(null)

  useEffect(() => {
    if (!client) {
      setSecret('')
      setShowSecret(false)
      setScope('')
      setAudience('')
      setError(null)
      setResult(null)
      return
    }
    setScope((client.allowedScopes ?? []).join(' '))
    setAudience((client.allowedAudiences ?? [])[0] ?? '')
  }, [client])

  if (!client) {
    return (
      <Sheet open={false} onClose={onClose} title="">
        <></>
      </Sheet>
    )
  }

  const mint = async () => {
    if (!secret) {
      toast.error('Paste the client_secret first')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const body: Record<string, string> = {
        grant_type: 'client_credentials',
        client_id: client.clientId,
        client_secret: secret,
      }
      if (scope.trim()) body.scope = scope.trim()
      if (audience.trim()) body.audience = audience.trim()
      const res = await api.post('/oauth/token', body)
      const jwt = res.data.access_token as string
      const [h, p] = jwt.split('.')
      setResult({
        rawJwt: jwt,
        header: decodeJwtSegment(h),
        payload: decodeJwtSegment(p),
        expiresIn: res.data.expires_in,
        scope: res.data.scope ?? '',
      })
    } catch (err: any) {
      setError(
        err?.response?.data?.message ??
          err?.response?.data?.error ??
          err?.message ??
          'Token request failed',
      )
    } finally {
      setBusy(false)
    }
  }

  const host =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://auth.inite.ai'
  const scopeLine = scope ? `\n  -d 'scope=${scope}' \\` : ''
  const audLine = audience ? `\n  -d 'audience=${audience}' \\` : ''
  const curlSnippet = `curl -X POST ${host}/v1/oauth/token \\
  -H 'Content-Type: application/x-www-form-urlencoded' \\
  -d 'grant_type=client_credentials' \\
  -d 'client_id=${client.clientId}' \\
  -d 'client_secret=<your-secret>' \\${scopeLine}${audLine}`

  return (
    <Sheet
      open
      onClose={() => !busy && onClose()}
      title="Test M2M token"
      subtitle={client.clientId}
      width="md"
    >
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <FieldLabel label="Client secret" />
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await api.post(
                    `/admin/oauth-clients/${client.clientId}/rotate-secret`,
                    { force: false, graceWindowSeconds: 3600 },
                    config,
                  )
                  setSecret(res.data.clientSecret)
                  setShowSecret(true)
                  toast.success(
                    'Fresh secret issued (1h grace on the previous one)',
                  )
                } catch {
                  toast.error('Rotation failed')
                }
              }}
              className="text-[11px] text-[color:var(--warning)] hover:opacity-80 inline-flex items-center gap-1 -mt-1"
            >
              <RefreshCw className="w-3 h-3" />
              Issue fresh
            </button>
          </div>
          <div className="relative">
            <input
              type={showSecret ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder="paste secret or click 'Issue fresh'"
              className="w-full h-9 px-3 pr-9 bg-[var(--bg-elevated)] border border-[var(--border-strong)] rounded-md text-sm text-[var(--text)] font-mono placeholder:text-[var(--text-faint)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-ring)]/40"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              aria-label={showSecret ? 'Hide' : 'Show'}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-faint)] hover:text-[var(--text-muted)]"
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel label="Scope" hint="optional" />
            <TextField
              mono
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              placeholder="brain:read brain:write"
            />
          </div>
          <div>
            <FieldLabel label="Audience" hint="optional" />
            <TextField
              mono
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              placeholder="brain"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={mint}
          disabled={busy || !secret}
          className="w-full h-9 inline-flex items-center justify-center gap-1.5 text-sm font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <PlayCircle className="w-4 h-4" />
          )}
          Mint test token
        </button>

        {error && (
          <div className="text-xs text-[color:var(--danger)] bg-[color:var(--danger)]/5 border border-[color:var(--danger)]/30 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="bg-[color:var(--success)]/5 border border-[color:var(--success)]/30 rounded-md px-3 py-2 text-xs text-[color:var(--success)] flex items-center gap-2">
              <Check className="w-3.5 h-3.5" />
              Token minted · expires in {result.expiresIn}s
            </div>

            <CodeBlock
              label="access_token"
              code={result.rawJwt}
              maxHeight="6rem"
            />

            {result.payload && (
              <CodeBlock
                label="decoded payload"
                code={JSON.stringify(result.payload, null, 2)}
              />
            )}
            {result.payload?.cnf?.jkt && (
              <p className="text-[11px] text-[var(--accent)]">
                ✓ DPoP-bound (cnf.jkt present)
              </p>
            )}
          </div>
        )}

        <div className="pt-3 border-t border-[var(--border)]">
          <CodeBlock
            label={
              <span className="inline-flex items-center gap-1">
                <Terminal className="w-3 h-3" />
                curl snippet
              </span>
            }
            code={curlSnippet}
          />
        </div>
      </div>
    </Sheet>
  )
}

function CodeBlock({
  label,
  code,
  maxHeight,
}: {
  label: React.ReactNode
  code: string
  maxHeight?: string
}) {
  const copy = () => {
    navigator.clipboard.writeText(code)
    toast.success('Copied')
  }
  return (
    <div className="bg-[var(--bg)] border border-[var(--border)] rounded-md overflow-hidden">
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-[var(--border)]">
        <span className="text-[11px] text-[var(--text-muted)]">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="text-[var(--text-faint)] hover:text-[var(--text)]"
          aria-label="Copy"
        >
          <Copy className="w-3 h-3" />
        </button>
      </div>
      <pre
        className="px-2.5 py-2 text-[11px] font-mono text-[var(--text)] whitespace-pre-wrap break-all overflow-y-auto"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {code}
      </pre>
    </div>
  )
}

// ===== New secret reveal modal =====

function NewSecretDialog({
  secret,
  onClose,
}: {
  secret: string | null
  onClose: () => void
}) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!secret) setShow(false)
  }, [secret])

  if (!secret) return null

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg shadow-xl"
      >
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-9 h-9 rounded-md flex items-center justify-center bg-[color:var(--warning)]/10 text-[color:var(--warning)]">
              <KeyRound className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                New client secret
              </h3>
              <p className="mt-0.5 text-xs text-[color:var(--warning)]">
                Save this secret now — it will not be shown again.
              </p>
            </div>
          </div>
          <div className="mt-4 relative">
            <input
              type={show ? 'text' : 'password'}
              readOnly
              value={secret}
              className="w-full h-9 px-3 pr-16 bg-[var(--bg)] border border-[var(--border-strong)] rounded-md text-xs text-[var(--text)] font-mono"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="p-1.5 text-[var(--text-faint)] hover:text-[var(--text)]"
                aria-label={show ? 'Hide' : 'Show'}
              >
                {show ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(secret)
                  toast.success('Copied')
                }}
                className="p-1.5 text-[var(--text-faint)] hover:text-[var(--text)]"
                aria-label="Copy"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-8 px-3 text-xs font-medium rounded-md bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]"
          >
            I&apos;ve saved it
          </button>
        </div>
      </div>
    </div>
  )
}
