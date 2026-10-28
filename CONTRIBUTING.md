# Contributing to pactwright-studio

Thanks for helping build Pactwright.

## The one rule you can't skip: update `ROADMAP.md`

**Every contribution updates this repo's `ROADMAP.md`** — code, tests, docs, CI, config,
dependency bumps. In the same PR:

1. Change the status of the tasks you touched: `[ ]` → `[~]` → `[x]` (add `(#PR, YYYY-MM-DD)` when done).
2. No matching task? Add one in the right phase with the next free ID and the full format.
3. Update the progress counts and "Last updated".
4. Append one line to the Update log.

The `roadmap-check` CI job fails any PR that doesn't modify `ROADMAP.md`. Full rules:
[`AGENTS.md`](AGENTS.md) §1.

## Before you start
- Read [`docs/ARCHITECTURE_ESSENTIALS.md`](docs/ARCHITECTURE_ESSENTIALS.md).
- Pick an issue labelled `Stellar Wave`; its body names the roadmap task ID.
- Issues labelled `core-team-only` are not open to outside contributors.

## Setup

```bash
nvm use
pnpm install
cp .env.example .env.local
pnpm dev
```


## Pull requests
- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
- Tests for every behavior change; CI must be green.
- Behavior changes need an ADR in `docs/adr/` first.
