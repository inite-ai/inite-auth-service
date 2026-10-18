@AGENTS.md

## Claude Code notes

- Project skills: `/contribute` (idea → spec → code + tests → gates → PR,
  with stop points for red zones) and `/spec-idea` (idea → filed issue, no
  code). Both live in `.claude/skills/`.
- `npm run lint` runs ESLint with `--fix` and may rewrite files; review the
  diff after it.
- Personal permission tweaks go in `.claude/settings.local.json`
  (gitignored), not in a committed settings file.
