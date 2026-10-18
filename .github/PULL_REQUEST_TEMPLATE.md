<!--
Thanks for contributing! Please read CONTRIBUTING.md first (agents: AGENTS.md).
Note: this project is open-core (AGPL-3.0 + commercial) and requires a CLA —
the CLA bot will prompt you on your first PR.
The PR title becomes the squash commit: use a Conventional Commit
(`feat(oauth): …`, `fix: …`, `docs: …`).
-->

## In plain words

One or two sentences a non-engineer can follow: what changes for whom.

## What & why

What does this change and why?

## Type

- [ ] Bug fix
- [ ] Feature
- [ ] Hardening / security
- [ ] Docs
- [ ] Refactor / chore

## Zone

- [ ] green
- [ ] yellow — what could break:
- [ ] red — approved design: #

(Zones are defined in [AGENTS.md](https://github.com/inite-ai/inite-auth-service/blob/main/AGENTS.md#zones).)

## Checklist

- [ ] `npm run lint`, `npm run build` and `npm test` pass locally
- [ ] Frontend touched → `check:size`, `check:noindex`, `typecheck`, `build` pass in `frontend/`
- [ ] Tests added/updated for behavior changes (list them below)
- [ ] Security-sensitive paths (tokens, PKCE, sessions) have a test for the
      security property, not just the happy path
- [ ] New migrations are append-only (`prisma/migrations/NNNN_*`)
- [ ] No token claim shape change, or it follows the
      [Triad contract](https://github.com/inite-ai/inite-triad/blob/main/docs/compatibility.md) §7
- [ ] No secrets committed (`gitleaks detect --config .gitleaks.toml`)
- [ ] Commit messages explain the *why*

## Tests added

## AI-assisted

- [ ] No
- [ ] Yes — agent/model:

(Disclosure, not judgement — it helps reviewers know what to double-check.)

## Related issues

Closes #
