'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'
import { SkeletonRow } from '@/components/ui'
import SettingRow from './setting-row'
import SecretPanel from './secret-panel'
import { SettingView } from './types'

/** Preserve the registry order the API returns, but list groups in this order. */
const GROUP_ORDER = ['Security features', 'Tokens', 'Rich Authorization Requests', 'mTLS']

function groupRank(group: string): number {
  const i = GROUP_ORDER.indexOf(group)
  return i === -1 ? GROUP_ORDER.length : i
}

export default function SettingsSection({ accessToken }: { accessToken: string }) {
  const [settings, setSettings] = useState<SettingView[]>([])
  const [loading, setLoading] = useState(true)
  const [editingSecret, setEditingSecret] = useState<SettingView | null>(null)

  const config = useMemo(
    () => ({ headers: { Authorization: `Bearer ${accessToken}` } }),
    [accessToken],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/settings', config)
      setSettings(res.data as SettingView[])
    } catch {
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }, [config])

  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const map = new Map<string, SettingView[]>()
    for (const s of settings) {
      const list = map.get(s.group) ?? []
      list.push(s)
      map.set(s.group, list)
    }
    return [...map.entries()].sort((a, b) => groupRank(a[0]) - groupRank(b[0]))
  }, [settings])

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => <SkeletonRow key={i} />)}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <p className="text-xs text-[var(--text-muted)] max-w-prose">
        Runtime configuration. An <span className="text-[var(--text)]">override</span> is
        stored in the database and takes effect immediately; reset it to fall back
        to the deployment&rsquo;s environment value. Secrets are never displayed.
      </p>

      {groups.map(([group, items]) => (
        <section key={group}>
          <div className="flex items-center gap-2 mb-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--text-faint)]" />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {group}
            </h3>
          </div>
          <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded-lg">
            {items.map((s) => (
              <SettingRow
                key={s.key}
                setting={s}
                config={config}
                onChanged={load}
                onEditSecret={setEditingSecret}
              />
            ))}
          </div>
        </section>
      ))}

      <SecretPanel
        setting={editingSecret}
        config={config}
        onClose={() => setEditingSecret(null)}
        onSaved={() => { setEditingSecret(null); load() }}
      />
    </div>
  )
}
