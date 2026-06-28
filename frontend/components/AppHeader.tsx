'use client'

import Link from 'next/link'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { ChevronDown, LogOut, Shield, User as UserIcon } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { LocaleSwitcher } from '@/components/ui/LocaleSwitcher'
import { authStorage } from '@/lib/authStorage'
import api from '@/lib/api'

interface AppHeaderProps {
  /** User to render in the user menu. When absent, header shows Sign-in CTA. */
  user?: {
    id: string
    email: string
    name?: string
    metadata?: { isAdmin?: boolean }
  } | null
  /** Slot for a small breadcrumb / page title next to the logo. */
  context?: ReactNode
  /** When true, omits the user-menu entirely (used on auth surfaces). */
  hideUserMenu?: boolean
}

/**
 * Single header used across the app. Sticky, 1px bottom border, no
 * shadow — matches Linear's compact chrome.
 *
 * Owns: brand mark, optional page context, locale switcher, user
 * menu (when signed in) or Sign-in CTA (when not).
 */
export function AppHeader({ user, context, hideUserMenu = false }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur supports-[backdrop-filter]:bg-[var(--bg)]/60">
      <div className="max-w-6xl mx-auto h-12 px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/" className="flex items-center gap-2 group">
            <span
              className="w-5 h-5 rounded-[5px] bg-[var(--accent)] flex items-center justify-center text-[10px] font-bold text-white"
              aria-hidden="true"
            >
              I
            </span>
            <span className="text-sm font-semibold text-[var(--text)] tracking-tight">
              INITE
            </span>
          </Link>
          {context && (
            <>
              <span className="text-[var(--text-faint)]" aria-hidden="true">/</span>
              <div className="text-sm text-[var(--text-muted)] truncate">
                {context}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <LocaleSwitcher />
          {!hideUserMenu &&
            (user ? <UserMenu user={user} /> : <SignInCta />)}
        </div>
      </div>
    </header>
  )
}

function SignInCta() {
  return (
    <Link
      href="/login"
      className="ml-1 h-8 px-2.5 inline-flex items-center text-xs font-medium text-[var(--text)] rounded-md hover:bg-[var(--bg-overlay)]"
    >
      Sign in
    </Link>
  )
}

function UserMenu({
  user,
}: {
  user: NonNullable<AppHeaderProps['user']>
}) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const handleLogout = async () => {
    try {
      await api.get('/oauth/logout', { withCredentials: true }).catch(() => {})
    } finally {
      authStorage.clear()
      router.push('/login')
    }
  }

  const initials = (user.name ?? user.email ?? '?')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className="relative ml-1" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-8 pl-1 pr-1.5 inline-flex items-center gap-1.5 rounded-md hover:bg-[var(--bg-overlay)] transition-colors"
      >
        <span className="w-6 h-6 rounded-full bg-[var(--bg-overlay)] border border-[var(--border)] flex items-center justify-center text-[10px] font-medium text-[var(--text-muted)]">
          {initials || '·'}
        </span>
        <ChevronDown className="w-3 h-3 text-[var(--text-faint)]" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 min-w-[14rem] p-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded-md shadow-lg"
        >
          <div className="px-2 py-2 border-b border-[var(--border)] mb-1">
            <p className="text-sm font-medium text-[var(--text)] truncate">
              {user.name || user.email}
            </p>
            {user.name && (
              <p className="text-xs text-[var(--text-muted)] truncate">
                {user.email}
              </p>
            )}
          </div>
          <MenuItem
            onClick={() => {
              setOpen(false)
              router.push('/account')
            }}
            icon={<UserIcon className="w-3.5 h-3.5" />}
            label="Account"
          />
          {user.metadata?.isAdmin && (
            <MenuItem
              onClick={() => {
                setOpen(false)
                router.push('/admin')
              }}
              icon={<Shield className="w-3.5 h-3.5" />}
              label="Admin"
            />
          )}
          <div className="h-px bg-[var(--border)] my-1" />
          <MenuItem
            onClick={handleLogout}
            icon={<LogOut className="w-3.5 h-3.5" />}
            label="Sign out"
          />
        </div>
      )}
    </div>
  )
}

function MenuItem({
  onClick,
  icon,
  label,
}: {
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="menuitem"
      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--bg-overlay)] rounded text-left"
    >
      <span className="text-[var(--text-muted)]">{icon}</span>
      {label}
    </button>
  )
}
