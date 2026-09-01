import { beginCell, Cell } from '@ton/core';
import * as nacl from 'tweetnacl';
import { createHash } from 'crypto';
import { verifyTonProof, type TonProof } from '../ton-proof';

/**
 * These build a wallet the way a real one is shaped — a state-init whose hash
 * IS the account address and whose data cell carries the signing key — so the
 * address/key binding is exercised, not just the signature maths.
 */

const DOMAIN = 'auth.inite.ai';
const PAYLOAD = 'a3f1c8d20b7e4a9f';
const MAX_AGE = 300;

/** v3/v4 data layout: seqno(32) ‖ subwallet(32) ‖ pubkey(256). */
function buildWallet(publicKey: Buffer): { address: string; stateInit: string } {
  const code = beginCell().storeUint(0xdeadbeef, 32).endCell();
  const data = beginCell()
    .storeUint(0, 32)
    .storeUint(698983191, 32)
    .storeBuffer(publicKey)
    .endCell();

  const stateInit = beginCell()
    .storeBit(0) // split_depth: absent
    .storeBit(0) // special: absent
    .storeBit(1)
    .storeRef(code)
    .storeBit(1)
    .storeRef(data)
    .storeBit(0) // library: absent
    .endCell();

  return {
    address: `0:${stateInit.hash().toString('hex')}`,
    stateInit: stateInit.toBoc().toString('base64'),
  };
}

function sign(
  secretKey: Uint8Array,
  address: string,
  proof: Omit<TonProof, 'signature'>,
): string {
  const [workchainPart, hashPart] = address.split(':');
  const workchain = Buffer.alloc(4);
  workchain.writeInt32BE(Number(workchainPart));

  const domain = Buffer.from(proof.domain.value, 'utf8');
  const domainLength = Buffer.alloc(4);
  domainLength.writeUInt32LE(domain.byteLength);

  const timestamp = Buffer.alloc(8);
  timestamp.writeBigUInt64LE(BigInt(proof.timestamp));

  const message = Buffer.concat([
    Buffer.from('ton-proof-item-v2/', 'utf8'),
    workchain,
    Buffer.from(hashPart!, 'hex'),
    domainLength,
    domain,
    timestamp,
    Buffer.from(proof.payload, 'utf8'),
  ]);

  const inner = createHash('sha256').update(message).digest();
  const digest = createHash('sha256')
    .update(Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from('ton-connect', 'utf8'), inner]))
    .digest();

  return Buffer.from(nacl.sign.detached(digest, secretKey)).toString('base64');
}

function makeCase(overrides: { timestamp?: number; payload?: string; domain?: string } = {}) {
  const keys = nacl.sign.keyPair();
  const publicKey = Buffer.from(keys.publicKey);
  const wallet = buildWallet(publicKey);

  const unsigned = {
    timestamp: overrides.timestamp ?? Math.floor(Date.now() / 1000),
    domain: { lengthBytes: 0, value: overrides.domain ?? DOMAIN },
    payload: overrides.payload ?? PAYLOAD,
  };
  unsigned.domain.lengthBytes = Buffer.from(unsigned.domain.value, 'utf8').byteLength;

  return {
    keys,
    publicKey,
    wallet,
    input: {
      address: wallet.address,
      publicKey: publicKey.toString('base64'),
      walletStateInit: wallet.stateInit,
      proof: { ...unsigned, signature: sign(keys.secretKey, wallet.address, unsigned) },
      expectedDomain: DOMAIN,
      expectedPayload: PAYLOAD,
      maxAgeSeconds: MAX_AGE,
    },
  };
}

describe('verifyTonProof', () => {
  it('accepts a proof signed by the key the address commits to', () => {
    expect(verifyTonProof(makeCase().input)).toEqual({ valid: true });
  });

  it('rejects a tampered signature', () => {
    const { input } = makeCase();
    const bytes = Buffer.from(input.proof.signature, 'base64');
    bytes.writeUInt8(bytes.readUInt8(0) ^ 0xff, 0);

    expect(
      verifyTonProof({ ...input, proof: { ...input.proof, signature: bytes.toString('base64') } }),
    ).toEqual({ valid: false, reason: 'bad-signature' });
  });

  it('rejects a proof issued for another domain', () => {
    // Signed correctly, but for evil.example — a phished proof must not
    // transfer to this relying party.
    const { input } = makeCase({ domain: 'evil.example' });

    expect(verifyTonProof(input)).toEqual({ valid: false, reason: 'domain-mismatch' });
  });

  it('rejects a proof carrying a payload this server did not issue', () => {
    const { input } = makeCase({ payload: 'replayed-from-elsewhere' });

    expect(verifyTonProof(input)).toEqual({ valid: false, reason: 'payload-mismatch' });
  });

  it.each([
    ['stale', -(MAX_AGE + 60)],
    ['implausibly far in the future', MAX_AGE + 60],
  ])('rejects a timestamp %s', (_label, offset) => {
    const { input } = makeCase({ timestamp: Math.floor(Date.now() / 1000) + offset });

    expect(verifyTonProof(input)).toEqual({ valid: false, reason: 'expired' });
  });

  it('rejects a valid signature presented against someone else\'s address', () => {
    // The core attack the binding exists to stop: sign with your own key,
    // claim the victim's account.
    const attacker = makeCase();
    const victim = makeCase();

    expect(
      verifyTonProof({ ...attacker.input, address: victim.wallet.address }),
    ).toEqual({ valid: false, reason: 'address-key-mismatch' });
  });

  it('rejects a state-init that does not hash to the claimed address', () => {
    const attacker = makeCase();
    const other = makeCase();

    expect(
      verifyTonProof({ ...attacker.input, walletStateInit: other.wallet.stateInit }),
    ).toEqual({ valid: false, reason: 'address-key-mismatch' });
  });

  it('rejects a public key absent from the wallet it claims', () => {
    const { input } = makeCase();
    const stranger = Buffer.from(nacl.sign.keyPair().publicKey);

    expect(
      verifyTonProof({ ...input, publicKey: stranger.toString('base64') }),
    ).toEqual({ valid: false, reason: 'address-key-mismatch' });
  });

  it.each([
    ['no workchain separator', 'deadbeef'],
    ['a non-hex account hash', '0:zzzz'],
    ['a truncated account hash', '0:abcd'],
  ])('rejects an address with %s', (_label, address) => {
    const { input } = makeCase();

    expect(verifyTonProof({ ...input, address })).toEqual({
      valid: false,
      reason: 'malformed-address',
    });
  });

  it('rejects an unparseable state-init', () => {
    const { input } = makeCase();

    expect(verifyTonProof({ ...input, walletStateInit: 'not-a-boc' })).toEqual({
      valid: false,
      reason: 'malformed-state-init',
    });
  });

  it('reads the key from a v5 wallet data layout', () => {
    // W5 stores the key further in; both known offsets must be tried or
    // legitimate v5 wallets are rejected.
    const keys = nacl.sign.keyPair();
    const publicKey = Buffer.from(keys.publicKey);

    const code = beginCell().storeUint(0xfeedface, 32).endCell();
    const data = beginCell()
      .storeUint(1, 1)
      .storeUint(0, 32)
      .storeUint(0, 32)
      .storeBuffer(publicKey)
      .endCell();
    const stateInit = beginCell()
      .storeBit(0)
      .storeBit(0)
      .storeBit(1)
      .storeRef(code)
      .storeBit(1)
      .storeRef(data)
      .storeBit(0)
      .endCell();

    const address = `0:${stateInit.hash().toString('hex')}`;
    const unsigned = {
      timestamp: Math.floor(Date.now() / 1000),
      domain: { lengthBytes: Buffer.from(DOMAIN).byteLength, value: DOMAIN },
      payload: PAYLOAD,
    };

    expect(
      verifyTonProof({
        address,
        publicKey: publicKey.toString('base64'),
        walletStateInit: (Cell.fromBase64(stateInit.toBoc().toString('base64'))).toBoc().toString('base64'),
        proof: { ...unsigned, signature: sign(keys.secretKey, address, unsigned) },
        expectedDomain: DOMAIN,
        expectedPayload: PAYLOAD,
        maxAgeSeconds: MAX_AGE,
      }),
    ).toEqual({ valid: true });
  });
});
