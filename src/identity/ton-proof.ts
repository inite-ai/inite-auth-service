import { Cell } from '@ton/core';
import * as nacl from 'tweetnacl';
import { createHash } from 'crypto';

/**
 * TON Connect `ton_proof` verification.
 *
 * Replaces a flow that could never succeed: the frontend sent
 * `base64(message text)` as the "signature" while the server ran a real
 * Ed25519 check, so every TON link attempt failed closed. This implements the
 * actual TON Connect v2 proof, whose signed preimage is
 *
 *   msg  = "ton-proof-item-v2/"
 *        ‖ workchain (int32 BE) ‖ address hash (32 bytes)
 *        ‖ domain length (uint32 LE) ‖ domain
 *        ‖ timestamp (uint64 LE)
 *        ‖ payload
 *   sig  = Ed25519(sha256( 0xffff ‖ "ton-connect" ‖ sha256(msg) ))
 *
 * A valid signature alone proves only that the presenter holds *some* key —
 * it says nothing about the address they claim. `verifyTonProof` therefore
 * also binds the two: the wallet's state-init must hash to the claimed
 * address, and the public key must be the one embedded in that state-init.
 * Without both checks a caller could sign with their own key and claim
 * anyone's address.
 */

const PROOF_PREFIX = 'ton-proof-item-v2/';
const CONNECT_PREFIX = 'ton-connect';
const ED25519_PUBLIC_KEY_BYTES = 32;

/**
 * Bit offset of the public key within a wallet's data cell, per version:
 *   v3/v4 — seqno(32) ‖ wallet_id(32) ‖ pubkey(256)
 *   v5/W5 — is_signature_allowed(1) ‖ seqno(32) ‖ wallet_id(32) ‖ pubkey(256)
 * They sit one bit apart, so both are read and matched against the key the
 * wallet claims rather than guessing a version — a wrong guess would reject a
 * legitimate wallet, and a wrong-offset read simply fails to match.
 */
const PUBLIC_KEY_BIT_OFFSETS = [64, 65] as const;

/** The proof object a wallet returns under `connectItems.tonProof`. */
export interface TonProof {
  timestamp: number;
  domain: { lengthBytes: number; value: string };
  signature: string;
  payload: string;
}

export interface VerifyTonProofInput {
  /** Raw address as the wallet reports it, e.g. "0:83dfd…". */
  address: string;
  /** Base64 Ed25519 public key claimed by the wallet. */
  publicKey: string;
  /** Base64 BOC of the wallet's state-init, used to bind key to address. */
  walletStateInit: string;
  proof: TonProof;
  /** Domain this server accepts proofs for (RP_ID). */
  expectedDomain: string;
  /** The single-use payload this server issued for this attempt. */
  expectedPayload: string;
  /** How old a proof may be, in seconds. */
  maxAgeSeconds: number;
}

/** Why a proof was rejected. Callers surface this as a 400, never to the wallet. */
export type TonProofFailure =
  | 'malformed-address'
  | 'malformed-state-init'
  | 'domain-mismatch'
  | 'payload-mismatch'
  | 'expired'
  | 'address-key-mismatch'
  | 'bad-signature';

export type TonProofResult =
  | { valid: true }
  | { valid: false; reason: TonProofFailure };

/** Split "0:hex" into its workchain and 32-byte account hash. */
function parseRawAddress(address: string): { workchain: number; hash: Buffer } | null {
  const [workchainPart, hashPart] = address.split(':');
  if (workchainPart === undefined || hashPart === undefined) return null;

  const workchain = Number.parseInt(workchainPart, 10);
  if (!Number.isInteger(workchain)) return null;
  if (!/^[0-9a-fA-F]{64}$/.test(hashPart)) return null;

  return { workchain, hash: Buffer.from(hashPart, 'hex') };
}

/** The exact byte sequence the wallet signed. */
function buildProofMessage(
  parsed: { workchain: number; hash: Buffer },
  proof: TonProof,
): Buffer {
  const workchain = Buffer.alloc(4);
  workchain.writeInt32BE(parsed.workchain);

  const domain = Buffer.from(proof.domain.value, 'utf8');
  const domainLength = Buffer.alloc(4);
  domainLength.writeUInt32LE(domain.byteLength);

  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64LE(BigInt(proof.timestamp));

  return Buffer.concat([
    Buffer.from(PROOF_PREFIX, 'utf8'),
    workchain,
    parsed.hash,
    domainLength,
    domain,
    timestamp,
    Buffer.from(proof.payload, 'utf8'),
  ]);
}

/** sha256( 0xffff ‖ "ton-connect" ‖ sha256(message) ) — what Ed25519 signs. */
function buildSignedDigest(message: Buffer): Buffer {
  const inner = createHash('sha256').update(message).digest();
  const full = Buffer.concat([
    Buffer.from([0xff, 0xff]),
    Buffer.from(CONNECT_PREFIX, 'utf8'),
    inner,
  ]);
  return createHash('sha256').update(full).digest();
}

/**
 * Read the public key out of a wallet's state-init.
 *
 * The data cell layout differs by wallet version, so both known offsets are
 * tried and the caller decides by comparing against the claimed key. Returns
 * every candidate rather than guessing a version — a wrong guess would reject
 * a legitimate wallet.
 */
function publicKeyCandidates(stateInit: Cell): Buffer[] {
  const dataCell = stateInit.refs[1];
  if (!dataCell) return [];

  const candidates: Buffer[] = [];
  for (const offset of PUBLIC_KEY_BIT_OFFSETS) {
    // A short data cell simply doesn't hold a key at this offset.
    if (dataCell.bits.length < offset + ED25519_PUBLIC_KEY_BYTES * 8) continue;
    try {
      const slice = dataCell.beginParse();
      slice.skip(offset);
      candidates.push(slice.loadBuffer(ED25519_PUBLIC_KEY_BYTES));
    } catch {
      // Layout didn't fit — not this wallet version.
    }
  }
  return candidates;
}

/**
 * Tie the claimed public key to the claimed address.
 *
 * A signature alone proves possession of some key; this is what makes it
 * proof of *this account*. The state-init must hash to the account (that
 * hash IS the address on TON) and must carry the key that signed.
 */
function bindKeyToAddress(
  input: Pick<VerifyTonProofInput, 'walletStateInit' | 'publicKey'>,
  addressHash: Buffer,
): { publicKey: Buffer } | { reason: TonProofFailure } {
  let stateInit: Cell;
  let publicKey: Buffer;
  try {
    stateInit = Cell.fromBase64(input.walletStateInit);
    publicKey = Buffer.from(input.publicKey, 'base64');
  } catch {
    return { reason: 'malformed-state-init' };
  }

  if (publicKey.byteLength !== ED25519_PUBLIC_KEY_BYTES) {
    return { reason: 'malformed-state-init' };
  }
  if (!stateInit.hash().equals(addressHash)) {
    return { reason: 'address-key-mismatch' };
  }
  if (!publicKeyCandidates(stateInit).some((c) => c.equals(publicKey))) {
    return { reason: 'address-key-mismatch' };
  }

  return { publicKey };
}

/**
 * Verify a TON Connect proof end to end.
 *
 * Ordered cheapest-first so a malformed or stale request never reaches the
 * signature check. Returns a reason rather than throwing so the caller can
 * log precisely while answering the client generically.
 */
export function verifyTonProof(input: VerifyTonProofInput): TonProofResult {
  const parsed = parseRawAddress(input.address);
  if (!parsed) return { valid: false, reason: 'malformed-address' };

  if (input.proof.domain.value !== input.expectedDomain) {
    return { valid: false, reason: 'domain-mismatch' };
  }

  // The payload is a single-use nonce this server issued; a proof replayed
  // from elsewhere carries someone else's.
  if (input.proof.payload !== input.expectedPayload) {
    return { valid: false, reason: 'payload-mismatch' };
  }

  const ageSeconds = Math.floor(Date.now() / 1000) - input.proof.timestamp;
  if (ageSeconds > input.maxAgeSeconds || ageSeconds < -input.maxAgeSeconds) {
    return { valid: false, reason: 'expired' };
  }

  const bound = bindKeyToAddress(input, parsed.hash);
  if ('reason' in bound) return { valid: false, reason: bound.reason };
  const { publicKey } = bound;

  let signature: Buffer;
  try {
    signature = Buffer.from(input.proof.signature, 'base64');
  } catch {
    return { valid: false, reason: 'bad-signature' };
  }
  if (signature.byteLength !== nacl.sign.signatureLength) {
    return { valid: false, reason: 'bad-signature' };
  }

  const digest = buildSignedDigest(buildProofMessage(parsed, input.proof));
  const ok = nacl.sign.detached.verify(digest, signature, publicKey);
  return ok ? { valid: true } : { valid: false, reason: 'bad-signature' };
}
