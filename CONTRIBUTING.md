# Contributing to INITE Auth Service

Thanks for opening this file — that's already most of the battle. This is a
production identity provider, not a hobby project. For an auth service the bar is
higher than usual: a subtle bug here is a security bug. The standard for changes
is "would I sign off on this PR if I'd never met you, knowing it guards real
users' credentials?" Here's what that means concretely.

## Before you start

- **New here?** Browse [`good first issue`](https://github.com/inite-ai/inite-auth-service/issues?q=is%3Aopen+label%3A%22good+first+issue%22)
  and skim the [Code of Conduct](CODE_OF_CONDUCT.md). PRs of any size are welcome.
- **Read the README and [SECURITY.md](SECURITY.md)** — especially the threat
  model and the list of known limitations. A lot of "why isn't this done the
  obvious way" questions are answered there.
- **Skim the migrations** in `prisma/migrations/`. Numbered, append-only;
  every schema change lands as a new directory. They're a diary of what shipped.
- **Read the recent commit log.** Commit messages explain the *why* — they're
  the closest thing this repo has to ADRs.

## Setting up locally

```bash
git clone git@github.com:inite-ai/inite-auth-service.git
cd inite-auth-service
npm install

# Bring up Postgres + Redis
docker compose up -d postgres redis

# Copy + fill env
cp .env.example .env
$EDITOR .env

# Apply schema, then run
npm run prisma:migrate
npm run start:dev
```

Node 22+ is expected. If something breaks at setup, **file an issue** — that
usually means the onboarding docs are wrong. Don't suffer in silence.

## The hard bars for a PR

### 1. Tests pass

```bash
npm test            # unit suite (~20 spec files)
npm run test:e2e    # end-to-end
```

Touching token issuance, refresh rotation, PKCE, session handling, or anything
in the OAuth/OIDC flow? Add a test that exercises the **security** property, not
just the happy path — e.g. "a rotated refresh token is rejected on reuse",
"a token minted for audience A is rejected at audience B".

### 2. Migrations are append-only

`prisma/migrations/NNNN_description/` in numeric order. **Never edit a shipped
migration** — once applied, Prisma records it and silently skips the file on
re-deploy, so edits are invisible in prod. Add a new numbered migration instead.
If your change alters a column type or drops a field, note in the PR description
whether existing rows need backfilling and how.

### 3. No new dependencies without justification

A new top-level dep needs a one-sentence reason in the PR description and a
`package-lock.json` diff showing the transitive cost. For an auth service, be
especially wary of crypto/JWT/session libraries — prefer the well-audited
incumbents already in use over a "lighter alternative" with a smaller audit
surface. Reimplementing 10-20 lines beats pulling a 200KB dep.

### 4. Commit messages explain the why

Bad: `fix bug in token refresh`

Good:

> fix(token): reject refresh token on reuse after rotation
>
> Rotation issued a new token but left the old hash valid until TTL, so a
> stolen-then-rotated token still worked for one cycle. We now revoke the
> entire token family on detected reuse (theft signal) instead of just the
> presented token.

The body should answer "if I bisect to this commit six months from now, will I
understand what I'm looking at?"

Co-author trailers for AI-assisted commits
(`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`) are
welcome and expected — we keep the trail honest.

## Reporting security issues

**Do not open a public issue or PR for a vulnerability.** Follow the private
disclosure process in [SECURITY.md](SECURITY.md). Security fixes are coordinated
privately, then disclosed.

## What we don't accept

- **Weakening a security default to make something "just work."** If PKCE,
  audience binding, or HMAC validation is in the way, the fix is almost never to
  relax it. Open an issue first.
- **Backward-compatibility shims for hypothetical callers.** The API is
  versioned (`/v1/...`); we cut a new version to evolve incompatibly.
- **Tests that mock out the thing under test.** The only legitimate mocks are
  external systems (SMTP, Redis in pure-unit tests).
- **Hardcoded secrets, even in tests or examples.** Use generated dummies and
  placeholders. The `gitleaks` gate (see below) will block obvious cases.

## What we DO welcome

- **Hardening PRs** with a clear threat described — rate-limiting gaps, timing
  side-channels, missing audience/issuer checks.
- **Closing known limitations** from SECURITY.md (DPoP, revocation cache,
  outbox retry) with tests.
- **Type-narrowing** — replacing an `as any` or loose `Record` that shouldn't
  be there.
- **Docs and onboarding fixes** — if you hit a wrong step, fix it for the next
  person.

## Secret scanning

CI runs [`gitleaks`](https://github.com/gitleaks/gitleaks) against the repo. Run
it locally before pushing:

```bash
gitleaks detect --source . --config .gitleaks.toml --redact -v
```

If you hit a false positive, add a narrowly-scoped entry to `.gitleaks.toml`
with a comment proving it's a non-secret — never broaden the allowlist to
silence a real finding.

## License & CLA

This project is **open-core**: AGPL-3.0-or-later plus a commercial license (see
[LICENSING.md](LICENSING.md)). Because we offer the commercial track, we ask
contributors to sign a one-time **Contributor License Agreement (CLA)** so we
can ship your contribution under both licenses. In plain terms:

- You **keep copyright** to your contribution.
- You grant us the right to distribute it under AGPL-3.0 **and** the commercial
  license.
- Your contribution is, of course, available to everyone under AGPL-3.0.

The CLA bot will prompt you on your first PR. If your employer needs a custom
arrangement, open an issue or email mike@inite.ai and we'll sort it out.

## Questions

GitHub Issues and Discussions — public, so the next person Googling the same
question finds the answer.
