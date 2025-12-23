'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { User, Edit2, Check, X, Camera } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '@/lib/api'

interface ProfileSectionProps {
  user: any
  accessToken: string
  onUpdate: () => void
}

export default function ProfileSection({ user, accessToken, onUpdate }: ProfileSectionProps) {
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: user?.name || '',
    bio: user?.bio || '',
    location: user?.location || '',
    profession: user?.profession || '',
  })

  const handleSave = async () => {
    setLoading(true)
    try {
      await api.put('/identity/profile', formData, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      toast.success('Profile updated successfully')
      setEditing(false)
      onUpdate()
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to update profile')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setFormData({
      name: user?.name || '',
      bio: user?.bio || '',
      location: user?.location || '',
      profession: user?.profession || '',
    })
    setEditing(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-8 border border-slate-700/50 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">Profile</h2>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="px-4 py-2 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition flex items-center gap-2 text-sm"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 bg-slate-700/50 text-slate-300 rounded-xl hover:bg-slate-600/50 transition flex items-center gap-2 text-sm"
            >
              <X className="w-4 h-4" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl hover:from-violet-600 hover:to-fuchsia-600 transition flex items-center gap-2 text-sm disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-start gap-6">
        {/* Avatar */}
        <div className="relative group">
          <div className="w-24 h-24 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-violet-500/25">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" className="w-full h-full rounded-2xl object-cover" />
            ) : (
              user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'
            )}
          </div>
          {editing && (
            <button className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
              <Camera className="w-6 h-6 text-white" />
            </button>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 space-y-4">
          {editing ? (
            <>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Bio</label>
                <textarea
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition resize-none"
                  placeholder="Tell us about yourself"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Location</label>
                  <input
                    type="text"
                    value={formData.location}
                    onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                    placeholder="City, Country"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Profession</label>
                  <input
                    type="text"
                    value={formData.profession}
                    onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
                    placeholder="Your profession"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <h3 className="text-2xl font-bold text-white">{user?.name || 'Anonymous User'}</h3>
                <p className="text-slate-400">{user?.email}</p>
              </div>
              {user?.bio && <p className="text-slate-300">{user.bio}</p>}
              <div className="flex gap-4 text-sm">
                {user?.location && (
                  <span className="text-slate-400">📍 {user.location}</span>
                )}
                {user?.profession && (
                  <span className="text-slate-400">💼 {user.profession}</span>
                )}
              </div>
              <div className="pt-2">
                <p className="text-xs text-slate-500 font-mono">
                  DID: {user?.did?.substring(0, 32)}...
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  )
}

