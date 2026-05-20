'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  ExternalLink,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'

interface OAuthClientsSectionProps {
  accessToken: string
}

export default function OAuthClientsSection({ accessToken }: OAuthClientsSectionProps) {
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingClient, setEditingClient] = useState<any>(null)
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [newSecret, setNewSecret] = useState<string | null>(null)
  const [showSecret, setShowSecret] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [createForm, setCreateForm] = useState({
    name: '',
    clientId: '',
    redirectUris: [''] as string[],
    allowedScopes: ['openid', 'profile', 'email'] as string[],
    allowedGrants: ['authorization_code', 'refresh_token'] as string[],
    companyId: '',
    allowedAudiences: [] as string[],
    backchannelLogoutUri: '',
  })

  const [editForm, setEditForm] = useState<any>({
    name: '',
    redirectUris: [] as string[],
    allowedScopes: [] as string[],
    allowedGrants: [] as string[],
    companyId: '',
    allowedAudiences: [] as string[],
    backchannelLogoutUri: '',
    active: true,
  })

  const [scopeInput, setScopeInput] = useState('')
  const [editScopeInput, setEditScopeInput] = useState('')
  const [audInput, setAudInput] = useState('')
  const [editAudInput, setEditAudInput] = useState('')

  const config = { headers: { Authorization: `Bearer ${accessToken}` } }

  const loadClients = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/admin/oauth-clients', config)
      setClients(res.data)
    } catch {
      toast.error('Failed to load OAuth clients')
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    loadClients()
  }, [loadClients])

  const loadClientDetails = async (clientId: string) => {
    try {
      const res = await api.get(`/admin/oauth-clients/${clientId}`, config)
      setSelectedClient(res.data)
    } catch {
      toast.error('Failed to load client details')
    }
  }

  const createClient = async () => {
    if (!createForm.name || !createForm.clientId) {
      toast.error('Name and Client ID are required')
      return
    }
    if (createForm.allowedGrants.length === 0) {
      toast.error('Pick at least one grant type')
      return
    }
    if (createForm.allowedScopes.length === 0) {
      toast.error('Pick at least one scope')
      return
    }
    // Redirect URIs are only meaningful for grants that redirect.
    const wantsRedirect =
      createForm.allowedGrants.includes('authorization_code') ||
      createForm.allowedGrants.includes('refresh_token')
    if (wantsRedirect && createForm.redirectUris.filter(Boolean).length === 0) {
      toast.error('Authorization code grant requires at least one redirect URI')
      return
    }
    // Server falls back to clientId as `aud` when allowedAudiences is empty —
    // safe but operators forget the wider blast-radius implication. Force the
    // explicit choice in UI for M2M clients.
    if (
      createForm.allowedGrants.includes('client_credentials') &&
      createForm.allowedAudiences.length === 0
    ) {
      toast.error('Audience allow-list required when client_credentials grant is enabled')
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/admin/oauth-clients', {
        name: createForm.name,
        clientId: createForm.clientId,
        redirectUris: createForm.redirectUris.filter(Boolean),
        allowedScopes: createForm.allowedScopes,
        allowedGrants: createForm.allowedGrants,
        companyId: createForm.companyId.trim() || null,
        allowedAudiences: createForm.allowedAudiences,
        backchannelLogoutUri: createForm.backchannelLogoutUri.trim() || null,
      }, config)

      setNewSecret(res.data.clientSecret)
      setShowCreate(false)
      setCreateForm({
        name: '',
        clientId: '',
        redirectUris: [''],
        allowedScopes: ['openid', 'profile', 'email'],
        allowedGrants: ['authorization_code', 'refresh_token'],
        companyId: '',
        allowedAudiences: [],
        backchannelLogoutUri: '',
      })
      setScopeInput('')
      setAudInput('')
      loadClients()
      toast.success('OAuth client created')
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to create client')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (client: any) => {
    setEditingClient(client)
    setEditForm({
      name: client.name || '',
      redirectUris: Array.isArray(client.redirectUris) ? [...client.redirectUris] : [],
      allowedScopes: Array.isArray(client.allowedScopes) ? [...client.allowedScopes] : [],
      allowedGrants: Array.isArray(client.allowedGrants) ? [...client.allowedGrants] : [],
      companyId: client.companyId ?? '',
      allowedAudiences: Array.isArray(client.allowedAudiences) ? [...client.allowedAudiences] : [],
      backchannelLogoutUri: client.backchannelLogoutUri ?? '',
      active: client.active !== false,
    })
    setEditScopeInput('')
    setEditAudInput('')
  }

  const saveClient = async () => {
    if (!editingClient) return
    if (editForm.allowedGrants.length === 0) {
      toast.error('Pick at least one grant type')
      return
    }
    if (editForm.allowedScopes.length === 0) {
      toast.error('Pick at least one scope')
      return
    }
    if (
      editForm.allowedGrants.includes('client_credentials') &&
      (editForm.allowedAudiences ?? []).length === 0
    ) {
      toast.error('Audience allow-list required when client_credentials grant is enabled')
      return
    }
    setSaving(true)
    try {
      await api.put(`/admin/oauth-clients/${editingClient.clientId}`, {
        name: editForm.name,
        redirectUris: editForm.redirectUris.filter(Boolean),
        allowedScopes: editForm.allowedScopes,
        allowedGrants: editForm.allowedGrants,
        companyId: editForm.companyId.trim() ? editForm.companyId.trim() : null,
        allowedAudiences: editForm.allowedAudiences,
        backchannelLogoutUri: editForm.backchannelLogoutUri?.trim()
          ? editForm.backchannelLogoutUri.trim()
          : null,
        active: editForm.active,
      }, config)

      toast.success('Client updated')
      setEditingClient(null)
      loadClients()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update client')
    } finally {
      setSaving(false)
    }
  }

  // Available grant types — kept here so the UI stays a single source of
  // truth. If you add a grant in oauth.service.ts, mirror it here.
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

  // Common scope presets — quick-add buttons. Operators can also type
  // arbitrary scope strings (verticals decide their own scope vocabulary).
  const SCOPE_PRESETS = [
    'openid', 'profile', 'email', 'offline_access', 'wallet', 'admin',
    'brain:read', 'brain:write', 'brain:admin', 'brain:read_pii',
  ]

  const toggleGrant = (
    form: any,
    setForm: (v: any) => void,
    grant: string,
  ) => {
    const set = new Set<string>(form.allowedGrants)
    if (set.has(grant)) {
      set.delete(grant)
    } else {
      set.add(grant)
    }
    setForm({ ...form, allowedGrants: Array.from(set) })
  }

  const addScope = (
    form: any,
    setForm: (v: any) => void,
    raw: string,
  ) => {
    const scope = raw.trim()
    if (!scope) return
    if (form.allowedScopes.includes(scope)) return
    setForm({ ...form, allowedScopes: [...form.allowedScopes, scope] })
  }

  const removeScope = (
    form: any,
    setForm: (v: any) => void,
    scope: string,
  ) => {
    setForm({ ...form, allowedScopes: form.allowedScopes.filter((s: string) => s !== scope) })
  }

  // Common audiences — quick-add for known horizontal services.
  const AUDIENCE_PRESETS = ['brain', 'inbox', 'assistant', 'admin-panel']

  const addAudience = (
    form: any,
    setForm: (v: any) => void,
    raw: string,
  ) => {
    const a = raw.trim()
    if (!a) return
    if ((form.allowedAudiences ?? []).includes(a)) return
    setForm({ ...form, allowedAudiences: [...(form.allowedAudiences ?? []), a] })
  }

  const removeAudience = (
    form: any,
    setForm: (v: any) => void,
    a: string,
  ) => {
    setForm({
      ...form,
      allowedAudiences: (form.allowedAudiences ?? []).filter((x: string) => x !== a),
    })
  }

  // 24h default grace; null when the operator picks "force revoke now"
  const [rotateTarget, setRotateTarget] = useState<string | null>(null)
  const [rotateGraceHours, setRotateGraceHours] = useState(24)
  const [rotateForce, setRotateForce] = useState(false)
  const [rotateBusy, setRotateBusy] = useState(false)

  const openRotateDialog = (clientId: string) => {
    setRotateTarget(clientId)
    setRotateGraceHours(24)
    setRotateForce(false)
  }

  const confirmRotate = async () => {
    if (!rotateTarget) return
    setRotateBusy(true)
    try {
      const body: any = { force: rotateForce }
      if (!rotateForce) {
        body.graceWindowSeconds = Math.max(0, Math.min(7 * 24, rotateGraceHours)) * 3600
      }
      const res = await api.post(
        `/admin/oauth-clients/${rotateTarget}/rotate-secret`,
        body,
        config,
      )
      setNewSecret(res.data.clientSecret)
      toast.success(
        rotateForce
          ? 'Secret rotated; previous secret revoked immediately'
          : `Secret rotated; previous secret accepted for ${rotateGraceHours}h`,
      )
      setRotateTarget(null)
    } catch {
      toast.error('Failed to rotate secret')
    } finally {
      setRotateBusy(false)
    }
  }

  const deleteClient = async (clientId: string) => {
    try {
      await api.delete(`/admin/oauth-clients/${clientId}`, config)
      toast.success('Client deleted')
      setDeleteConfirm(null)
      setSelectedClient(null)
      loadClients()
    } catch {
      toast.error('Failed to delete client')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl hover:from-violet-600 hover:to-fuchsia-600 transition flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          New Client
        </button>
      </div>

      {/* Clients List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : clients.length === 0 ? (
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-12 border border-slate-700/50 text-center">
            <AppWindow className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">No OAuth clients yet</p>
          </div>
        ) : (
          clients.map((client, i) => (
            <motion.div
              key={client.clientId}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 border border-slate-700/50"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-500 rounded-xl flex items-center justify-center flex-shrink-0">
                    {client.logoUrl ? (
                      <img src={client.logoUrl} alt="" className="w-full h-full rounded-xl object-cover" />
                    ) : (
                      <AppWindow className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{client.name}</h3>
                      {client.active === false && (
                        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="text-sm text-slate-400 bg-slate-800 px-2 py-0.5 rounded">{client.clientId}</code>
                      <button
                        onClick={() => copyToClipboard(client.clientId)}
                        className="text-slate-500 hover:text-slate-300 transition"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => loadClientDetails(client.clientId)}
                    className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 rounded-lg transition"
                    title="View details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => startEdit(client)}
                    className="p-2 text-slate-400 hover:text-violet-400 hover:bg-slate-700/50 rounded-lg transition"
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openRotateDialog(client.clientId)}
                    className="p-2 text-slate-400 hover:text-amber-400 hover:bg-slate-700/50 rounded-lg transition"
                    title="Rotate secret"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(client.clientId)}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 rounded-lg transition"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Redirect URIs */}
              <div className="mt-3 pt-3 border-t border-slate-700/30">
                <p className="text-xs text-slate-500 mb-1">Redirect URIs</p>
                <div className="space-y-1">
                  {client.redirectUris?.map((uri: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2">
                      <ExternalLink className="w-3 h-3 text-slate-500 flex-shrink-0" />
                      <code className="text-xs text-slate-400 truncate">{uri}</code>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Rotate Secret Dialog */}
      <AnimatePresence>
        {rotateTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => !rotateBusy && setRotateTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-white mb-1">
                Rotate client secret
              </h3>
              <p className="text-sm text-slate-400 mb-4 font-mono">
                {rotateTarget}
              </p>

              <div className="space-y-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rotateForce}
                    onChange={(e) => setRotateForce(e.target.checked)}
                    className="mt-1"
                  />
                  <div>
                    <p className="text-sm text-white">
                      Revoke previous secret immediately
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Use this when the old secret is known to be
                      compromised. Existing callers using the old
                      secret will start failing right away.
                    </p>
                  </div>
                </label>

                {!rotateForce && (
                  <div>
                    <label className="block text-sm text-slate-400 mb-2">
                      Grace window: <span className="text-white">{rotateGraceHours}h</span>
                    </label>
                    <input
                      type="range"
                      min={1}
                      max={168}
                      step={1}
                      value={rotateGraceHours}
                      onChange={(e) => setRotateGraceHours(parseInt(e.target.value))}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>1h</span>
                      <span>24h (default)</span>
                      <span>7d</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      Previous secret keeps working for this long so
                      callers can roll forward without an outage.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setRotateTarget(null)}
                  disabled={rotateBusy}
                  className="flex-1 px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl hover:bg-slate-700 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmRotate}
                  disabled={rotateBusy}
                  className="flex-1 px-4 py-2.5 bg-amber-500 text-white rounded-xl hover:bg-amber-400 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {rotateBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Rotate
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* New Secret Display */}
      <AnimatePresence>
        {newSecret && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setNewSecret(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-2xl p-8 max-w-md w-full border border-slate-700"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <RefreshCw className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Client Secret</h3>
                <p className="text-amber-400 text-sm">Save this secret now — it won&apos;t be shown again!</p>
              </div>

              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={newSecret}
                  readOnly
                  className="w-full px-4 py-3 pr-20 bg-slate-800 border border-slate-600 rounded-xl text-white font-mono text-sm"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                  <button
                    onClick={() => setShowSecret(!showSecret)}
                    className="p-1.5 text-slate-400 hover:text-white transition"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => copyToClipboard(newSecret)}
                    className="p-1.5 text-slate-400 hover:text-white transition"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  setNewSecret(null)
                  setShowSecret(false)
                }}
                className="w-full mt-4 px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition"
              >
                I&apos;ve saved it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Client Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-2xl p-8 max-w-lg w-full border border-slate-700 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">New OAuth Client</h3>
                <button
                  onClick={() => setShowCreate(false)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Application Name</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="My App"
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Client ID</label>
                  <input
                    type="text"
                    value={createForm.clientId}
                    onChange={(e) => setCreateForm({ ...createForm, clientId: e.target.value })}
                    placeholder="my-app"
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Grant Types</label>
                  <div className="space-y-2">
                    {GRANT_OPTIONS.map((g) => {
                      const checked = createForm.allowedGrants.includes(g.id)
                      return (
                        <button
                          type="button"
                          key={g.id}
                          onClick={() => toggleGrant(createForm, setCreateForm, g.id)}
                          className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border transition text-left ${
                            checked
                              ? 'bg-violet-500/10 border-violet-500/50'
                              : 'bg-slate-800/30 border-slate-700 hover:bg-slate-800/60'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            checked ? 'bg-violet-500 border-violet-500' : 'border-slate-500'
                          }`}>
                            {checked && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-mono">{g.id}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{g.hint}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {(createForm.allowedGrants.includes('authorization_code') ||
                  createForm.allowedGrants.includes('refresh_token')) && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm text-slate-400">Redirect URIs</label>
                      <button
                        onClick={() => setCreateForm({ ...createForm, redirectUris: [...createForm.redirectUris, ''] })}
                        className="text-xs text-violet-400 hover:text-violet-300 transition flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add URI
                      </button>
                    </div>
                    <div className="space-y-2">
                      {createForm.redirectUris.map((uri: string, idx: number) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="url"
                            value={uri}
                            onChange={(e) => {
                              const uris = [...createForm.redirectUris]
                              uris[idx] = e.target.value
                              setCreateForm({ ...createForm, redirectUris: uris })
                            }}
                            placeholder="https://app.example.com/callback"
                            className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-600 rounded-xl text-white font-mono text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                          />
                          {createForm.redirectUris.length > 1 && (
                            <button
                              onClick={() => {
                                const uris = createForm.redirectUris.filter((_: string, i: number) => i !== idx)
                                setCreateForm({ ...createForm, redirectUris: uris })
                              }}
                              className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(createForm.allowedGrants.includes('authorization_code') ||
                  createForm.allowedGrants.includes('refresh_token')) && (
                  <div>
                    <label className="text-sm text-slate-400 block mb-2">
                      Back-channel Logout URI
                      <span className="ml-2 text-xs text-slate-500">
                        optional — RP receives a signed logout_token on /oauth/logout
                      </span>
                    </label>
                    <input
                      type="url"
                      value={createForm.backchannelLogoutUri}
                      onChange={(e) =>
                        setCreateForm({
                          ...createForm,
                          backchannelLogoutUri: e.target.value,
                        })
                      }
                      placeholder="https://app.example.com/oidc/logout"
                      className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-600 rounded-xl text-white font-mono text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                    />
                  </div>
                )}

                {createForm.allowedGrants.includes('client_credentials') && (
                  <>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">
                        Company ID
                        <span className="text-slate-500 font-normal ml-2">
                          — tenant key embedded as JWT `sub`
                        </span>
                      </label>
                      <input
                        type="text"
                        value={createForm.companyId}
                        onChange={(e) => setCreateForm({ ...createForm, companyId: e.target.value })}
                        placeholder="co_smar_chat"
                        className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white font-mono text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Leave blank to use Client ID as `sub`. Set this to match an existing tenant
                        (e.g. brain database) so M2M calls land in the same tenant as legacy keys.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-slate-400 mb-2">
                        Allowed Audiences
                        <span className="text-slate-500 font-normal ml-2">
                          — services this client can mint tokens for
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {createForm.allowedAudiences.map((a) => (
                          <span
                            key={a}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/15 border border-amber-500/40 rounded-lg text-xs text-amber-200 font-mono"
                          >
                            {a}
                            <button
                              type="button"
                              onClick={() => removeAudience(createForm, setCreateForm, a)}
                              className="text-amber-300 hover:text-white"
                              aria-label={`Remove ${a}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={audInput}
                          onChange={(e) => setAudInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                              e.preventDefault()
                              addAudience(createForm, setCreateForm, audInput)
                              setAudInput('')
                            }
                          }}
                          placeholder="brain · inbox · ... and press Enter"
                          className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg text-white font-mono text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            addAudience(createForm, setCreateForm, audInput)
                            setAudInput('')
                          }}
                          className="px-3 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-600/50 transition text-sm"
                        >
                          Add
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {AUDIENCE_PRESETS.filter((a) => !createForm.allowedAudiences.includes(a)).map((a) => (
                          <button
                            type="button"
                            key={a}
                            onClick={() => addAudience(createForm, setCreateForm, a)}
                            className="px-2 py-0.5 text-xs text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 rounded border border-slate-700 hover:border-amber-500/40 transition font-mono"
                          >
                            + {a}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        Empty list = no constraint (audience defaults to Client ID).
                        Set explicitly to limit blast radius if this client's secret leaks.
                      </p>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Allowed Scopes</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {createForm.allowedScopes.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-500/15 border border-violet-500/40 rounded-lg text-xs text-violet-200 font-mono"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() => removeScope(createForm, setCreateForm, s)}
                          className="text-violet-300 hover:text-white"
                          aria-label={`Remove ${s}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={scopeInput}
                      onChange={(e) => setScopeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                          e.preventDefault()
                          addScope(createForm, setCreateForm, scopeInput)
                          setScopeInput('')
                        }
                      }}
                      placeholder="custom.scope and press Enter"
                      className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg text-white font-mono text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        addScope(createForm, setCreateForm, scopeInput)
                        setScopeInput('')
                      }}
                      className="px-3 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-600/50 transition text-sm"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {SCOPE_PRESETS.filter((s) => !createForm.allowedScopes.includes(s)).map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => addScope(createForm, setCreateForm, s)}
                        className="px-2 py-0.5 text-xs text-slate-400 hover:text-violet-300 hover:bg-violet-500/10 rounded border border-slate-700 hover:border-violet-500/40 transition font-mono"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowCreate(false)}
                    className="flex-1 px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createClient}
                    disabled={saving}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl hover:from-violet-600 hover:to-fuchsia-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Create
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Client Modal */}
      <AnimatePresence>
        {editingClient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setEditingClient(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-2xl p-8 max-w-lg w-full border border-slate-700 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Edit Client</h3>
                <button
                  onClick={() => setEditingClient(null)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-800/50 rounded-xl p-3">
                  <p className="text-xs text-slate-500">Client ID</p>
                  <code className="text-sm text-white">{editingClient.clientId}</code>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm text-slate-400">Redirect URIs</label>
                    <button
                      onClick={() => setEditForm({ ...editForm, redirectUris: [...(editForm.redirectUris || []), ''] })}
                      className="text-xs text-violet-400 hover:text-violet-300 transition flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add URI
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(editForm.redirectUris || []).map((uri: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="url"
                          value={uri}
                          onChange={(e) => {
                            const uris = [...editForm.redirectUris]
                            uris[idx] = e.target.value
                            setEditForm({ ...editForm, redirectUris: uris })
                          }}
                          placeholder="https://app.example.com/callback"
                          className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-slate-600 rounded-xl text-white font-mono text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                        />
                        <button
                          onClick={() => {
                            const uris = editForm.redirectUris.filter((_: string, i: number) => i !== idx)
                            setEditForm({ ...editForm, redirectUris: uris })
                          }}
                          className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {(!editForm.redirectUris || editForm.redirectUris.length === 0) && (
                      <p className="text-sm text-slate-500 text-center py-2">No redirect URIs configured</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">
                    Back-channel Logout URI
                    <span className="ml-2 text-xs text-slate-500">
                      optional — receives signed logout_token on /oauth/logout
                    </span>
                  </label>
                  <input
                    type="url"
                    value={editForm.backchannelLogoutUri || ''}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        backchannelLogoutUri: e.target.value,
                      })
                    }
                    placeholder="https://app.example.com/oidc/logout"
                    className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-600 rounded-xl text-white font-mono text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Grant Types</label>
                  <div className="space-y-2">
                    {GRANT_OPTIONS.map((g) => {
                      const checked = editForm.allowedGrants.includes(g.id)
                      return (
                        <button
                          type="button"
                          key={g.id}
                          onClick={() => toggleGrant(editForm, setEditForm, g.id)}
                          className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl border transition text-left ${
                            checked
                              ? 'bg-violet-500/10 border-violet-500/50'
                              : 'bg-slate-800/30 border-slate-700 hover:bg-slate-800/60'
                          }`}
                        >
                          <div className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 ${
                            checked ? 'bg-violet-500 border-violet-500' : 'border-slate-500'
                          }`}>
                            {checked && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-mono">{g.id}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{g.hint}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {editForm.allowedGrants.includes('client_credentials') && (
                  <>
                    <div>
                      <label className="block text-sm text-slate-400 mb-1">
                        Company ID
                        <span className="text-slate-500 font-normal ml-2">
                          — tenant key embedded as JWT `sub`
                        </span>
                      </label>
                      <input
                        type="text"
                        value={editForm.companyId}
                        onChange={(e) => setEditForm({ ...editForm, companyId: e.target.value })}
                        placeholder="co_smar_chat"
                        className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white font-mono text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Leave blank to use Client ID as `sub`.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm text-slate-400 mb-2">
                        Allowed Audiences
                        <span className="text-slate-500 font-normal ml-2">
                          — services this client can mint tokens for
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {(editForm.allowedAudiences ?? []).map((a: string) => (
                          <span
                            key={a}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/15 border border-amber-500/40 rounded-lg text-xs text-amber-200 font-mono"
                          >
                            {a}
                            <button
                              type="button"
                              onClick={() => removeAudience(editForm, setEditForm, a)}
                              className="text-amber-300 hover:text-white"
                              aria-label={`Remove ${a}`}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <input
                          type="text"
                          value={editAudInput}
                          onChange={(e) => setEditAudInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                              e.preventDefault()
                              addAudience(editForm, setEditForm, editAudInput)
                              setEditAudInput('')
                            }
                          }}
                          placeholder="brain · inbox · ... and press Enter"
                          className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg text-white font-mono text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent transition"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            addAudience(editForm, setEditForm, editAudInput)
                            setEditAudInput('')
                          }}
                          className="px-3 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-600/50 transition text-sm"
                        >
                          Add
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {AUDIENCE_PRESETS.filter((a) => !(editForm.allowedAudiences ?? []).includes(a)).map((a) => (
                          <button
                            type="button"
                            key={a}
                            onClick={() => addAudience(editForm, setEditForm, a)}
                            className="px-2 py-0.5 text-xs text-slate-400 hover:text-amber-300 hover:bg-amber-500/10 rounded border border-slate-700 hover:border-amber-500/40 transition font-mono"
                          >
                            + {a}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm text-slate-400 mb-2">Allowed Scopes</label>
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {editForm.allowedScopes.map((s: string) => (
                      <span
                        key={s}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-500/15 border border-violet-500/40 rounded-lg text-xs text-violet-200 font-mono"
                      >
                        {s}
                        <button
                          type="button"
                          onClick={() => removeScope(editForm, setEditForm, s)}
                          className="text-violet-300 hover:text-white"
                          aria-label={`Remove ${s}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={editScopeInput}
                      onChange={(e) => setEditScopeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
                          e.preventDefault()
                          addScope(editForm, setEditForm, editScopeInput)
                          setEditScopeInput('')
                        }
                      }}
                      placeholder="custom.scope and press Enter"
                      className="flex-1 px-3 py-2 bg-slate-800/50 border border-slate-600 rounded-lg text-white font-mono text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        addScope(editForm, setEditForm, editScopeInput)
                        setEditScopeInput('')
                      }}
                      className="px-3 py-2 bg-slate-700/50 text-slate-300 rounded-lg hover:bg-slate-600/50 transition text-sm"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {SCOPE_PRESETS.filter((s) => !editForm.allowedScopes.includes(s)).map((s) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => addScope(editForm, setEditForm, s)}
                        className="px-2 py-0.5 text-xs text-slate-400 hover:text-violet-300 hover:bg-violet-500/10 rounded border border-slate-700 hover:border-violet-500/40 transition font-mono"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    onClick={() => setEditForm({ ...editForm, active: !editForm.active })}
                    className="text-slate-300"
                  >
                    {editForm.active ? (
                      <ToggleRight className="w-8 h-8 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-slate-500" />
                    )}
                  </button>
                  <span className="text-sm text-slate-300">
                    {editForm.active ? 'Active' : 'Inactive'}
                  </span>
                </label>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setEditingClient(null)}
                    className="flex-1 px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveClient}
                    disabled={saving}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl hover:from-violet-600 hover:to-fuchsia-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Client Details Modal */}
      <AnimatePresence>
        {selectedClient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedClient(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-2xl p-8 max-w-lg w-full border border-slate-700"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">{selectedClient.name}</h3>
                <button
                  onClick={() => setSelectedClient(null)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-800/50 rounded-xl p-3">
                  <p className="text-xs text-slate-500">Client ID</p>
                  <code className="text-sm text-white">{selectedClient.clientId}</code>
                </div>

                {selectedClient.stats && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-white">{selectedClient.stats.totalAuthCodes}</p>
                      <p className="text-xs text-slate-500">Auth Codes</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-white">{selectedClient.stats.totalTokens}</p>
                      <p className="text-xs text-slate-500">Total Tokens</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                      <p className="text-lg font-bold text-white">{selectedClient.stats.activeTokens}</p>
                      <p className="text-xs text-slate-500">Active Tokens</p>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs text-slate-500 mb-2">Grant Types</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedClient.allowedGrants ?? []).map((g: string) => (
                      <code key={g} className="text-xs text-slate-200 bg-slate-800/50 border border-slate-700 px-2 py-1 rounded-lg">
                        {g}
                      </code>
                    ))}
                    {(!selectedClient.allowedGrants || selectedClient.allowedGrants.length === 0) && (
                      <span className="text-xs text-slate-500">none configured</span>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-500 mb-2">Allowed Scopes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedClient.allowedScopes ?? []).map((s: string) => (
                      <code key={s} className="text-xs text-violet-200 bg-violet-500/10 border border-violet-500/30 px-2 py-1 rounded-lg">
                        {s}
                      </code>
                    ))}
                    {(!selectedClient.allowedScopes || selectedClient.allowedScopes.length === 0) && (
                      <span className="text-xs text-slate-500">none configured</span>
                    )}
                  </div>
                </div>

                {selectedClient.companyId && (
                  <div className="bg-slate-800/50 rounded-xl p-3">
                    <p className="text-xs text-slate-500">Company ID (M2M `sub` claim)</p>
                    <code className="text-sm text-white">{selectedClient.companyId}</code>
                  </div>
                )}

                {selectedClient.allowedAudiences && selectedClient.allowedAudiences.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Allowed Audiences (M2M `aud` claim)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedClient.allowedAudiences.map((a: string) => (
                        <code key={a} className="text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 px-2 py-1 rounded-lg">
                          {a}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                {selectedClient.redirectUris && selectedClient.redirectUris.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-2">Redirect URIs</p>
                    <div className="space-y-1">
                      {selectedClient.redirectUris.map((uri: string, idx: number) => (
                        <code key={idx} className="block text-sm text-slate-300 bg-slate-800/50 px-3 py-2 rounded-lg break-all">
                          {uri}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-slate-800/50 rounded-xl p-3">
                  <p className="text-xs text-slate-500">Created</p>
                  <p className="text-sm text-white">{new Date(selectedClient.createdAt).toLocaleString()}</p>
                </div>

                <button
                  onClick={() => setSelectedClient(null)}
                  className="w-full px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-2xl p-8 max-w-sm w-full border border-slate-700"
            >
              <div className="text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Delete Client?</h3>
                <p className="text-slate-400 mb-6">
                  This will revoke all tokens and permanently delete this OAuth client.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteClient(deleteConfirm)}
                    className="flex-1 px-4 py-3 bg-red-500/20 text-red-400 rounded-xl hover:bg-red-500/30 transition"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
