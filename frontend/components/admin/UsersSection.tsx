'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  Search,
  ChevronLeft,
  ChevronRight,
  Edit2,
  Trash2,
  Shield,
  Mail,
  Check,
  X,
  Key,
  Wallet,
  Loader2,
  Eye,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'

interface UsersSectionProps {
  accessToken: string
}

export default function UsersSection({ accessToken }: UsersSectionProps) {
  const [users, setUsers] = useState<any[]>([])
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 })
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const config = { headers: { Authorization: `Bearer ${accessToken}` } }

  const loadUsers = useCallback(async (page = 1) => {
    setLoading(true)
    try {
      const res = await api.get(`/admin/users?page=${page}&limit=20`, config)
      setUsers(res.data.users)
      setPagination(res.data.pagination)
    } catch (error: any) {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [accessToken])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const loadUserDetails = async (userId: string) => {
    try {
      const res = await api.get(`/admin/users/${userId}`, config)
      setSelectedUser(res.data)
    } catch {
      toast.error('Failed to load user details')
    }
  }

  const startEdit = (user: any) => {
    setEditingUser(user)
    setEditForm({
      name: user.name || '',
      email: user.email || '',
      emailVerified: user.emailVerified || false,
      bio: user.bio || '',
      location: user.location || '',
      profession: user.profession || '',
      roles: (user.metadata?.roles || []).join(', '),
    })
  }

  const saveUser = async () => {
    if (!editingUser) return
    setSaving(true)
    try {
      const roles = editForm.roles
        .split(',')
        .map((r: string) => r.trim())
        .filter(Boolean)

      await api.put(`/admin/users/${editingUser.id}`, {
        name: editForm.name,
        email: editForm.email,
        emailVerified: editForm.emailVerified,
        bio: editForm.bio,
        location: editForm.location,
        profession: editForm.profession,
      }, config)

      await api.put(`/admin/users/${editingUser.id}/roles`, { roles }, config)

      toast.success('User updated')
      setEditingUser(null)
      loadUsers(pagination.page)
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  const deleteUser = async (userId: string) => {
    try {
      await api.delete(`/admin/users/${userId}`, config)
      toast.success('User deleted')
      setDeleteConfirm(null)
      setSelectedUser(null)
      loadUsers(pagination.page)
    } catch {
      toast.error('Failed to delete user')
    }
  }

  const filteredUsers = search
    ? users.filter(
        (u) =>
          u.name?.toLowerCase().includes(search.toLowerCase()) ||
          u.email?.toLowerCase().includes(search.toLowerCase()) ||
          u.did?.toLowerCase().includes(search.toLowerCase())
      )
    : users

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or DID..."
            className="w-full pl-12 pr-4 py-3 bg-slate-800/50 border border-slate-700/50 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
          />
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-slate-700/50 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">User</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Email</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Roles</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-slate-400">Created</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => (
                    <tr
                      key={user.id}
                      className="border-b border-slate-700/30 hover:bg-slate-800/50 transition"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-lg flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                            {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">{user.name || 'No name'}</p>
                            <p className="text-xs text-slate-500 font-mono truncate">{user.did?.substring(0, 24)}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-300 text-sm">{user.email || '—'}</span>
                          {user.emailVerified && (
                            <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1 flex-wrap">
                          {user.metadata?.roles?.map((role: string) => (
                            <span
                              key={role}
                              className={`px-2 py-0.5 text-xs rounded-full ${
                                role === 'admin'
                                  ? 'bg-violet-500/20 text-violet-300'
                                  : 'bg-slate-700 text-slate-300'
                              }`}
                            >
                              {role}
                            </span>
                          )) || <span className="text-slate-500 text-sm">—</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-400">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => loadUserDetails(user.id)}
                            className="p-2 text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50 rounded-lg transition"
                            title="View details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => startEdit(user)}
                            className="p-2 text-slate-400 hover:text-violet-400 hover:bg-slate-700/50 rounded-lg transition"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(user.id)}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700/50 rounded-lg transition"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/50">
                <span className="text-sm text-slate-400">
                  {pagination.total} users total
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadUsers(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-slate-300">
                    {pagination.page} / {pagination.pages}
                  </span>
                  <button
                    onClick={() => loadUsers(pagination.page + 1)}
                    disabled={pagination.page >= pagination.pages}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* User Details Modal */}
      <AnimatePresence>
        {selectedUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedUser(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-2xl p-8 max-w-lg w-full border border-slate-700 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">User Details</h3>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
                    {selectedUser.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white">{selectedUser.name || 'No name'}</h4>
                    <p className="text-slate-400">{selectedUser.email}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Email Verified', value: selectedUser.emailVerified ? 'Yes' : 'No' },
                    { label: '2FA', value: selectedUser.twoFactorEnabled ? 'Enabled' : 'Disabled' },
                    { label: 'Location', value: selectedUser.location || '—' },
                    { label: 'Profession', value: selectedUser.profession || '—' },
                  ].map((item) => (
                    <div key={item.label} className="bg-slate-800/50 rounded-xl p-3">
                      <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                      <p className="text-sm text-white">{item.value}</p>
                    </div>
                  ))}
                </div>

                {selectedUser.bio && (
                  <div className="bg-slate-800/50 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">Bio</p>
                    <p className="text-sm text-slate-300">{selectedUser.bio}</p>
                  </div>
                )}

                <div className="bg-slate-800/50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-1">DID</p>
                  <p className="text-xs text-slate-300 font-mono break-all">{selectedUser.did}</p>
                </div>

                {/* Stats */}
                {selectedUser.stats && (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                      <Key className="w-4 h-4 text-violet-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-white">{selectedUser.stats.totalPasskeys}</p>
                      <p className="text-xs text-slate-500">Passkeys</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                      <Wallet className="w-4 h-4 text-amber-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-white">{selectedUser.stats.totalWallets}</p>
                      <p className="text-xs text-slate-500">Wallets</p>
                    </div>
                    <div className="bg-slate-800/50 rounded-xl p-3 text-center">
                      <Shield className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                      <p className="text-lg font-bold text-white">{selectedUser.stats.activeSessions}</p>
                      <p className="text-xs text-slate-500">Sessions</p>
                    </div>
                  </div>
                )}

                {/* Passkeys list */}
                {selectedUser.passkeys?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-400 mb-2">Passkeys</p>
                    <div className="space-y-2">
                      {selectedUser.passkeys.map((pk: any) => (
                        <div key={pk.id} className="bg-slate-800/50 rounded-lg p-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm text-white">{pk.deviceName || 'Unnamed device'}</p>
                            <p className="text-xs text-slate-500">
                              Created {new Date(pk.createdAt).toLocaleDateString()}
                              {pk.lastUsedAt && ` · Last used ${new Date(pk.lastUsedAt).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Wallets list */}
                {selectedUser.wallets?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-slate-400 mb-2">Wallets</p>
                    <div className="space-y-2">
                      {selectedUser.wallets.map((w: any) => (
                        <div key={w.id} className="bg-slate-800/50 rounded-lg p-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500 uppercase">{w.chain}</span>
                            <span className="text-xs text-slate-500">{new Date(w.linkedAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-sm text-white font-mono truncate mt-1">{w.address}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Roles */}
                <div className="bg-slate-800/50 rounded-xl p-3">
                  <p className="text-xs text-slate-500 mb-2">Roles</p>
                  <div className="flex gap-2 flex-wrap">
                    {selectedUser.metadata?.roles?.map((role: string) => (
                      <span
                        key={role}
                        className={`px-3 py-1 text-sm rounded-full ${
                          role === 'admin'
                            ? 'bg-violet-500/20 text-violet-300'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {role}
                      </span>
                    )) || <span className="text-sm text-slate-500">No roles</span>}
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      startEdit(selectedUser)
                      setSelectedUser(null)
                    }}
                    className="flex-1 px-4 py-3 bg-violet-500/20 text-violet-300 rounded-xl hover:bg-violet-500/30 transition flex items-center justify-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" />
                    Edit User
                  </button>
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="flex-1 px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {editingUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setEditingUser(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 rounded-2xl p-8 max-w-lg w-full border border-slate-700 max-h-[80vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Edit User</h3>
                <button
                  onClick={() => setEditingUser(null)}
                  className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
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
                  <label className="block text-sm text-slate-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                  />
                </div>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.emailVerified}
                    onChange={(e) => setEditForm({ ...editForm, emailVerified: e.target.checked })}
                    className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-violet-500 focus:ring-violet-500"
                  />
                  <span className="text-sm text-slate-300">Email Verified</span>
                </label>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Bio</label>
                  <textarea
                    value={editForm.bio}
                    onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                    rows={2}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Location</label>
                    <input
                      type="text"
                      value={editForm.location}
                      onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Profession</label>
                    <input
                      type="text"
                      value={editForm.profession}
                      onChange={(e) => setEditForm({ ...editForm, profession: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-slate-400 mb-1">Roles (comma-separated)</label>
                  <input
                    type="text"
                    value={editForm.roles}
                    onChange={(e) => setEditForm({ ...editForm, roles: e.target.value })}
                    placeholder="admin, user, moderator"
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                  />
                  <p className="text-xs text-slate-500 mt-1">Tip: add &quot;admin&quot; to grant admin access</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setEditingUser(null)}
                    className="flex-1 px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveUser}
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
                <h3 className="text-xl font-bold text-white mb-2">Delete User?</h3>
                <p className="text-slate-400 mb-6">
                  This will permanently delete this user and all associated data (passkeys, wallets, sessions).
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 px-4 py-3 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => deleteUser(deleteConfirm)}
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
