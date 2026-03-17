'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Shield, Key, Fingerprint, Wallet, ArrowRight, Github } from 'lucide-react'
import { authStorage } from '@/lib/authStorage'

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [authenticated, setAuthenticated] = useState(false)

  useEffect(() => {
    // If OAuth params, go straight to login
    const clientId = searchParams.get('client_id')
    if (clientId) {
      const params = new URLSearchParams(searchParams.toString())
      router.push(`/login?${params.toString()}`)
      return
    }

    // Check if already authenticated
    if (authStorage.getValidToken()) {
      setAuthenticated(true)
    }
  }, [searchParams, router])

  const features = [
    {
      icon: Fingerprint,
      title: 'Passkeys',
      desc: 'Passwordless auth with Touch ID, Face ID & Windows Hello',
      color: 'from-violet-500 to-fuchsia-500',
    },
    {
      icon: Shield,
      title: 'OAuth 2.0 / OIDC',
      desc: 'Standards-compliant identity provider with PKCE',
      color: 'from-cyan-500 to-blue-500',
    },
    {
      icon: Wallet,
      title: 'Web3 Wallets',
      desc: 'Link Ethereum, Polygon & TON wallets via signatures',
      color: 'from-amber-500 to-orange-500',
    },
    {
      icon: Key,
      title: 'DID Identity',
      desc: 'Decentralized identifiers for portable identity',
      color: 'from-emerald-500 to-teal-500',
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-violet-500/15 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-fuchsia-500/15 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] left-[30%] w-[400px] h-[400px] bg-cyan-500/8 rounded-full blur-[100px]" />
      </div>

      <div className="relative">
        {/* Nav */}
        <motion.nav
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between max-w-6xl mx-auto px-6 py-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-white">INITE</span>
          </div>
          <div className="flex items-center gap-3">
            {authenticated ? (
              <button
                onClick={() => router.push('/account')}
                className="px-5 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl hover:from-violet-600 hover:to-fuchsia-600 transition text-sm font-medium"
              >
                My Account
              </button>
            ) : (
              <>
                <button
                  onClick={() => router.push('/login')}
                  className="px-5 py-2.5 text-slate-300 hover:text-white transition text-sm font-medium"
                >
                  Sign In
                </button>
                <button
                  onClick={() => router.push('/register')}
                  className="px-5 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl hover:from-violet-600 hover:to-fuchsia-600 transition text-sm font-medium"
                >
                  Get Started
                </button>
              </>
            )}
          </div>
        </motion.nav>

        {/* Hero */}
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-32">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-center max-w-3xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-violet-500/10 border border-violet-500/20 rounded-full text-violet-300 text-sm mb-8">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              Identity Provider
            </div>

            <h1 className="text-5xl md:text-7xl font-bold text-white leading-tight mb-6">
              Secure
              <span className="gradient-text"> Identity </span>
              <br />
              for the Web
            </h1>

            <p className="text-lg text-slate-400 max-w-xl mx-auto mb-10 leading-relaxed">
              Decentralized authentication with passkeys, OAuth 2.0, and Web3 wallets.
              One identity across the entire INITE ecosystem.
            </p>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => router.push(authenticated ? '/account' : '/register')}
                className="px-8 py-3.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white rounded-xl hover:from-violet-600 hover:to-fuchsia-600 transition font-medium flex items-center gap-2 shadow-lg shadow-violet-500/25"
              >
                {authenticated ? 'My Account' : 'Create Identity'}
                <ArrowRight className="w-4 h-4" />
              </button>
              <a
                href="/.well-known/openid-configuration"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-3.5 bg-slate-800/50 text-slate-300 rounded-xl hover:bg-slate-700/50 border border-slate-700/50 transition font-medium"
              >
                OIDC Config
              </a>
            </div>
          </motion.div>

          {/* Features */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-24"
          >
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 + i * 0.1 }}
                className="bg-gradient-to-br from-slate-900 to-slate-800/80 rounded-2xl p-6 border border-slate-700/40 hover:border-slate-600/60 transition group"
              >
                <div className={`w-12 h-12 bg-gradient-to-br ${f.color} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition`}>
                  <f.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="border-t border-slate-800/50 py-8"
        >
          <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
            <p className="text-sm text-slate-500">
              INITE Identity Provider
            </p>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <a href="/.well-known/openid-configuration" className="hover:text-slate-300 transition">
                OIDC
              </a>
              <a href="/.well-known/jwks.json" className="hover:text-slate-300 transition">
                JWKS
              </a>
              <a href="/health" className="hover:text-slate-300 transition">
                Status
              </a>
            </div>
          </div>
        </motion.footer>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}
