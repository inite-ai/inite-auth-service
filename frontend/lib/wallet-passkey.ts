import { startAuthentication, startRegistration } from '@simplewebauthn/browser'

/**
 * The INITE wallet's passkey: a passkey of its own, separate from the sign-in
 * ones, that is the only root user of the person's wallet in Turnkey.
 *
 * Its RP ID is the parent domain (inite.ai) so the same passkey works on every
 * INITE site that shows the wallet.
 */
export function walletRpId(): string {
  const host = window.location.hostname
  return host === 'inite.ai' || host.endsWith('.inite.ai') ? 'inite.ai' : host
}

function base64url(bytes: Uint8Array): string {
  let text = ''
  bytes.forEach((b) => (text += String.fromCharCode(b)))
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function random(size: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(size))
}

export interface WalletPasskey {
  challenge: string
  credentialId: string
  clientDataJson: string
  attestationObject: string
  transports: string[]
}

/** Make the wallet's passkey; what billing hands Turnkey to open the wallet. */
export async function createWalletPasskey(label: string): Promise<WalletPasskey> {
  const challenge = base64url(random(32))
  const result = await startRegistration({
    optionsJSON: {
      challenge,
      rp: { id: walletRpId(), name: 'INITE wallet' },
      user: { id: base64url(random(32)), name: label, displayName: label },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      attestation: 'none',
      timeout: 5 * 60 * 1000,
    },
  })
  return {
    challenge,
    credentialId: result.id,
    clientDataJson: result.response.clientDataJSON,
    attestationObject: result.response.attestationObject,
    transports: result.response.transports ?? [],
  }
}

/**
 * Stamp a Turnkey request with the wallet's passkey, as Turnkey's own
 * WebAuthn stamper does: the challenge is the hex SHA-256 of the exact body.
 * Returns the X-Stamp-WebAuthn value.
 */
export async function stampWithWalletPasskey(body: string, credentialId: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)))
  const hex = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
  const result = await startAuthentication({
    optionsJSON: {
      challenge: base64url(new TextEncoder().encode(hex)),
      rpId: walletRpId(),
      allowCredentials: [{ id: credentialId, type: 'public-key' }],
      userVerification: 'required',
      timeout: 5 * 60 * 1000,
    },
  })
  return JSON.stringify({
    authenticatorData: result.response.authenticatorData,
    clientDataJson: result.response.clientDataJSON,
    credentialId: result.id,
    signature: result.response.signature,
  })
}
