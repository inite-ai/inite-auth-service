'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/** A QR code for a string (an address, a PIX code), drawn locally. */
export function Qr({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    QRCode.toDataURL(value, { margin: 1, width: 192 })
      .then((url) => live && setSrc(url))
      .catch(() => live && setSrc(null))
    return () => {
      live = false
    }
  }, [value])
  if (!src) return null
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={label} width={192} height={192} className="rounded-md bg-white p-1" />
}

export const explorer = {
  address: (address: string) => `https://basescan.org/address/${address}`,
  tx: (hash: string) => `https://basescan.org/tx/${hash}`,
}

/** What went wrong, for a toast: billing's message, or the passkey prompt being dismissed. */
export function failure(error: unknown): 'cancelled' | string | null {
  const e = error as { name?: string; response?: { data?: { message?: string | string[] } } }
  if (e?.name === 'NotAllowedError' || e?.name === 'AbortError') return 'cancelled'
  const message = e?.response?.data?.message
  return Array.isArray(message) ? message.join('; ') : (message ?? null)
}
