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
    redirectUris: '',
    allowedScopes: 'openid, profile, email',
  })

  const [editForm, setEditForm] = useState({
    name: '',
    redirectUris: '',
    allowedScopes: '',
    isActive: true,
  })

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
    if (!createForm.name || !createForm.clientId || !createForm.redirectUris) {
      toast.error('Name, Client ID, and Redirect URIs are required')
      return
    }
    setSaving(true)
    try {
      const res = await api.post('/admin/oauth-clients', {
        name: createForm.name,
        clientId: createForm.clientId,
        redirectUris: createForm.redirectUris.split('\n').map((u) => u.trim()).filter(Boolean),
        allowedScopes: createForm.allowedScopes.split(',').map((s) => s.trim()).filter(Boolean),
      }, config)

      setNewSecret(res.data.clientSecret)
      setShowCreate(false)
      setCreateForm({ name: '', clientId: '', redirectUris: '', allowedScopes: 'openid, profile, email' })
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
      redirectUris: (client.redirectUris || []).join('\n'),
      allowedScopes: (client.allowedScopes || []).join(', '),
      isActive: client.active !== false,
    })
  }

  const saveClient = async () => {
    if (!editingClient) return
    setSaving(true)
    try {
      await api.put(`/admin/oauth-clients/${editingClient.clientId}`, {
        name: editForm.name,
        redirectUris: editForm.redirectUris.split('\n').map((u) => u.trim()).filter(Boolean),
        allowedScopes: editForm.allowedScopes.split(',').map((s) => s.trim()).filter(Boolean),
        isActive: editForm.isActive,
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

  const rotateSecret = async (clientId: string) => {
    try {
      const res = await api.post(`/admin/oauth-clients/${clientId}/rotate-secret`, {}, config)
      setNewSecret(res.data.clientSecret)
      toast.success('Secret rotated')
    } catch {
      toast.error('Failed to rotate secret')
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
                    <div className="flex gap-1 flex-wrap mt-2">
                      {client.allowedScopes?.map((scope: string) => (
                        <span key={scope} className="px-2 py-0.5 bg-slate-700/50 text-slate-400 text-xs rounded">
                          {scope}
                        </span>
                      ))}
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
                    onClick={() => rotateSecret(client.clientId)}
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
                  <label className="block text-sm text-slate-400 mb-1">Redirect URIs (one per line)</label>
                  <textarea
                    value={createForm.redirectUris}
                    onChange={(e) => setCreateForm({ ...createForm, redirectUris: e.target.value })}
                    rows={3}
                    placeholder={"https://myapp.com/callback\nhttp://localhost:3000/callback"}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition resize-none font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Allowed Scopes (comma-separated)</label>
                  <input
                    type="text"
                    value={createForm.allowedScopes}
                    onChange={(e) => setCreateForm({ ...createForm, allowedScopes: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                  />
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
                  <label className="block text-sm text-slate-400 mb-1">Redirect URIs (one per line)</label>
                  <textarea
                    value={editForm.redirectUris}
                    onChange={(e) => setEditForm({ ...editForm, redirectUris: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition resize-none font-mono text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Allowed Scopes (comma-separated)</label>
                  <input
                    type="text"
                    value={editForm.allowedScopes}
                    onChange={(e) => setEditForm({ ...editForm, allowedScopes: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                  />
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    onClick={() => setEditForm({ ...editForm, isActive: !editForm.isActive })}
                    className="text-slate-300"
                  >
                    {editForm.isActive ? (
                      <ToggleRight className="w-8 h-8 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="w-8 h-8 text-slate-500" />
                    )}
                  </button>
                  <span className="text-sm text-slate-300">
                    {editForm.isActive ? 'Active' : 'Inactive'}
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
                  <p className="text-xs text-slate-500 mb-2">Redirect URIs</p>
                  <div className="space-y-1">
                    {selectedClient.redirectUris?.map((uri: string, idx: number) => (
                      <code key={idx} className="block text-sm text-slate-300 bg-slate-800/50 px-3 py-2 rounded-lg break-all">
                        {uri}
                      </code>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-500 mb-2">Scopes</p>
                  <div className="flex gap-1 flex-wrap">
                    {selectedClient.allowedScopes?.map((scope: string) => (
                      <span key={scope} className="px-2 py-1 bg-slate-700/50 text-slate-300 text-xs rounded">
                        {scope}
                      </span>
                    ))}
                  </div>
                </div>

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
