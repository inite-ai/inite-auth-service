# Signing-key rotation (RS256 / JWKS)

The service signs access + id tokens with an RS256 key and publishes the
public half at `/.well-known/jwks.json`. `JwksService` supports **multiple
simultaneous keys** so the signing key can be rotated with an overlap window
and **zero downtime** — no token is invalidated mid-flight and JWKS-caching
RPs never see a gap.

## Key slots (env)

| Slot     | Public key env          | Private key env          | kid env (default)            | Role |
|----------|-------------------------|--------------------------|------------------------------|------|
| active   | `JWT_PUBLIC_KEY`        | `JWT_PRIVATE_KEY`        | `JWT_ACTIVE_KID` (`auth-rs256-key-1`) | Signs all tokens; published. |
| next     | `JWT_PUBLIC_KEY_NEXT`   | — (optional pre-promote) | `JWT_KID_NEXT` (`auth-rs256-key-2`)   | Published only, so RPs pre-cache it before it signs. |
| prev     | `JWT_PUBLIC_KEY_PREV`   | —                        | `JWT_KID_PREV` (`auth-rs256-key-0`)   | The just-retired key; published until its last token expires. |

Only `active` is required. With just `active` set, behavior is identical to
the historical single-key setup (kid `auth-rs256-key-1`).

Tokens carry the signing key's `kid` in their header. Verification (our own
guards, introspection, token-exchange, and external RPs via JWKS) resolves the
key by that `kid`, so a token signed by **any** currently-published key
validates.

## Rotation procedure (zero downtime)

Generate a new keypair:
```bash
openssl genrsa -out next.pem 2048
openssl rsa -in next.pem -pubout -out next.pub.pem
```

1. **Publish next (overlap begins).** Set `JWT_PUBLIC_KEY_NEXT=<next.pub.pem>`
   (kid `auth-rs256-key-2`) and deploy. JWKS now serves both keys; the active
   key still signs. Wait longer than your JWKS cache TTL so every RP has
   fetched the new key.

2. **Promote next → active.** Set `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY` to the new
   keypair and `JWT_ACTIVE_KID=auth-rs256-key-2`. Move the **old** public key to
   `JWT_PUBLIC_KEY_PREV` with `JWT_KID_PREV=auth-rs256-key-1`. Clear the NEXT
   slot. Deploy. New tokens sign under key-2; tokens still in flight under key-1
   keep verifying against the prev slot.

3. **Retire prev.** After the longest token lifetime has elapsed (access + id
   tokens are ~10 min; refresh-derived access tokens re-mint under the active
   key), remove `JWT_PUBLIC_KEY_PREV`/`JWT_KID_PREV` and deploy. Overlap closed.

## Notes

- **Key generation is operator/KMS-owned.** The service never mints signing
  keys itself — this ties into the planned Vault/KMS integration. Automating
  the env swaps above (or sourcing keys from KMS with overlapping versions) is
  the natural next step.
- **HS256 dev mode** (`JWT_SECRET`, no `JWT_PRIVATE_KEY`) has no JWKS and no
  rotation — it is dev-only and hard-fails at boot in production.
- On startup with >1 key present, the service logs the overlap window and the
  kids being published.
