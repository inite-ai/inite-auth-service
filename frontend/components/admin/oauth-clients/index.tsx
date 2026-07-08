'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { ConfirmDialog, SkeletonRow } from '@/components/ui'
import {
  OAuthClient,
  SortKey,
  SortDir,
  TypeFilter,
  StatusFilter,
  detectType,
  typeMeta,
} from './types'
import { Toolbar, EmptyState } from './toolbar'
import { ClientsTable } from './clients-table'
import { CreateClientPanel } from './create-panel'
import { EditClientPanel } from './edit-panel'
import { DetailsPanel } from './details-panel'
import { RotateSecretPanel } from './rotate-panel'
import { TestTokenPanel } from './test-token-panel'
import { NewSecretDialog } from './new-secret-dialog'

interface OAuthClientsSectionProps {
  accessToken: string
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
      <Toolbar
        search={search}
        onSearch={setSearch}
        typeFilter={typeFilter}
        onTypeFilter={setTypeFilter}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        counts={counts}
        total={clients.length}
        onNew={() => setCreating(true)}
      />

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
          <EmptyState total={clients.length} onNew={() => setCreating(true)} />
        ) : (
          <ClientsTable
            clients={visibleClients}
            sortKey={sortKey}
            sortDir={sortDir}
            onToggleSort={toggleSort}
            onOpenDetails={openDetails}
            onEdit={setEditingClient}
            onTest={setTestTarget}
            onRotate={setRotateTarget}
            onDelete={setDeleteConfirm}
          />
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
