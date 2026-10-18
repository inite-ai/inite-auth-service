---
name: spec-idea
description: Turn a plain-language idea for inite-auth-service (the INITE OAuth/OIDC issuer) into a well-formed GitHub issue using the Product idea template — no code. Use when someone "just wants to propose" a feature or change, or when /contribute hits a red zone and the design needs maintainer approval first.
---

# /spec-idea — propose without coding

Explain each step in plain language. No code changes, no branches.

1. **Restate** the idea; ask at most 3 clarifying questions.
2. **Check duplicates**:
   `gh issue list --repo inite-ai/inite-auth-service --search "<keywords>" --state all`.
   If a match exists, offer to comment on it instead.
3. **Locate** the affected area and zone using the Zones table in
   `AGENTS.md` (read it). Note if it touches the Triad token contract
   (<https://github.com/inite-ai/inite-triad/blob/main/docs/compatibility.md>).
4. **Draft the issue** following `.github/ISSUE_TEMPLATE/product-idea.yml`:
   - What do you want to be possible?
   - Who is it for / why?
   - How would you know it works?
   - Spec: problem · user-visible behaviour · API/UI change · data change ·
     risks (security, contract, migrations) · out of scope · zone.
   Security vulnerabilities never go in an issue — point to `SECURITY.md`.
5. **Show the draft**, get a yes, then file it:

```bash
gh issue create --repo inite-ai/inite-auth-service --label idea \
  --title "<plain-language title>" --body-file <draft.md>
```

6. Give the human the issue URL and say what happens next: a maintainer
   triages it; once the design is approved, `/contribute` can build it.
