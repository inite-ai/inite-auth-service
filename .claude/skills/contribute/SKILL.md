---
name: contribute
description: Take an idea for inite-auth-service (the INITE OAuth 2.1 / OIDC issuer) from plain words to a reviewed-ready pull request — restate, spec, find the zone, implement with tests, run the CI gates, open the PR. Use when someone says "I have an idea", "I want to add / change / fix something in the auth service", "help me contribute", or picks up a good-first-issue.
---

# /contribute — idea to PR in inite-auth-service

You are pairing with someone who may not be an engineer. `AGENTS.md` is the
source of truth (ground rules, zones, commands); read it first if it is not
already in context. **Explain what you are doing in plain language at every
step** — one or two sentences, no jargon without a gloss ("PKCE — the check
that stops a stolen login code from being used").

## 1. Understand

- Restate the idea back in plain words: who gets what new ability, and why.
- Ask **at most 3** clarifying questions, only ones whose answer changes the
  design. Wait for answers.

## 2. Locate

- Find the code it touches (`src/<module>/`, `frontend/app/…`, `docs/`) and
  name the **zone** from the AGENTS.md table: green / yellow / red.
- Check for an existing issue:
  `gh issue list --repo inite-ai/inite-auth-service --search "<keywords>" --state all`.
  If one exists, build on it (link it; don't duplicate). Newcomers looking
  for a starter: `gh issue list --label "good first issue"`.

## 3. Spec

Write a short spec and show it to the human:

- **Problem** — what is hard or impossible today.
- **Behaviour** — what a user / operator / client app will see.
- **API / UI change** — endpoints, params, pages.
- **Data change** — new columns/tables? (→ red zone: migration.)
- **Risks** — security properties, the Triad token contract
  (<https://github.com/inite-ai/inite-triad/blob/main/docs/compatibility.md>),
  migrations, operators' defaults.
- **Out of scope.**

**STOP — red zone.** If the change touches migrations/schema, token minting
or claims, signing keys/JWKS, token verification, admin/RBAC, encryption at
rest, account deletion/export, CI/Dockerfile/deploy, or weakens any security
default: do **not** write code. Offer to file the spec as an issue with the
Product idea template (or run `/spec-idea`):

```bash
gh issue create --repo inite-ai/inite-auth-service --label idea \
  --title "<plain-language title>" --body-file <spec.md>
```

Tell the human a maintainer must approve the design first, and end here.

## 4. Plan

Small steps, each one leaving the tree green. Show the plan; get a yes.

## 5. Implement with tests

- Work on a branch: `git switch -c <type>/<short-topic>` (e.g.
  `feat/consent-remember-choice`).
- Tests first where practical, in `src/<module>/__tests__/<thing>.spec.ts`.
  Model them on `src/oauth/__tests__/refresh-keeps-audience.spec.ts`; use
  `fakeSettings()` from `src/common/settings/settings.test-fixture.ts`.
  Auth-flow change → a test for the security property, not only the happy
  path.
- Respect the lint gates (300 lines/file, 3 params, complexity 12, no
  `any`, controllers don't import `src/prisma`). Split rather than disable.
- Format only files you touched: `npx prettier --write <files>`.

## 6. Run the gates

Backend (always):

```bash
npm run lint     # runs --fix; review what it changed
npm run build
npm test
```

If `frontend/` changed:

```bash
cd frontend && npm run check:size && npm run check:noindex && npm run typecheck && npm run build
```

Docker image and migration-path checks run in CI only. Do not start
database containers unless the human asks; if the work needs a database,
suggest the Codespace (`.devcontainer/`). All must be green; if a test fails,
fix the code — never skip, delete or weaken a test.

## 7. Docs

Update what a user or operator would read: `README.md`, `docs/`,
`frontend/app/docs/`, `.env.example` for a new setting. Never edit
`CHANGELOG.md` (release-please writes it).

## 8. Commit

Conventional Commits — release-please turns them into the version and
changelog: `feat(scope): …`, `fix(scope): …`, `docs: …`, `test: …`,
`refactor: …`; `!` for breaking. Body says *why*. Add an AI co-author
trailer (`Co-Authored-By: <agent> <noreply@…>`).

## 9. Pull request

```bash
gh repo fork --remote   # only if the human has no push access to inite-ai/inite-auth-service
git push -u origin HEAD
gh pr create --repo inite-ai/inite-auth-service --title "<conventional title>" --body-file <body.md>
```

Fill `.github/PULL_REQUEST_TEMPLATE.md`: plain-language summary, zone (link
the approved issue if red), gates run, tests added, AI-assisted disclosure.
The title must be a Conventional Commit (the squash commit uses it). Then
watch CI (`gh pr checks --watch`) and fix anything red. Tell the human what
happens next: a maintainer reviews; the CLA bot may ask them to sign once.
