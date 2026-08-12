# Contributing

Thanks for your interest in `mobilerun-mcp`. This document covers the local
dev workflow and the conventions this repo expects PRs to follow.

## Setup

```bash
pnpm install
pnpm run typecheck
bun test
```

- **pnpm** (`pnpm@10.18.1`, pinned via `packageManager` in `package.json`) is
  the installer only.
- **Bun** is the runtime — tests and the server itself run under `bun run` /
  `bun test`, not Node.

## Workflow

1. Fork or branch from `main`.
2. Make your change.
3. Run `pnpm run typecheck` and `bun test` locally; both must pass before
   opening a PR.
4. Open a PR against `main` with a clear description of the change and why
   it's needed.

CI (`.github/workflows/ci.yml`) runs the same two checks on every push and
pull request.

## Commit messages

This repo uses [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): message
```

Common types: `feat`, `fix`, `refactor`, `chore`, `ci`, `docs`, `style`,
`test`, `perf`, `build`, `revert`. Keep the subject line short and in the
imperative mood (e.g. `fix(server): reject malformed bearer tokens`).

## Tool contract changes

`packages/tools` is the auth-agnostic tool core consumed by multiple hosts
(the public server here, and — later — internal hosts). Any change to a
tool's name, input schema, or output shape is a contract change and must
follow the semver rules documented in `packages/tools/CONTRACT.md`. If that
file doesn't exist yet in your checkout, treat tool schemas as append-only
(new optional fields are safe; renames, removals, and type changes of
existing fields are breaking) until the contract doc lands, and call out the
change explicitly in your PR description.

## Code style

- Keep the dependency boundary intact: `packages/tools` must not depend on
  Hono, OpenTelemetry, `@mobilerun/sdk`, or perform network calls — only
  `zod` and the MCP SDK types.
- Prefer small, focused PRs over large multi-concern ones.

## Reporting bugs / security issues

Functional bugs: open a GitHub issue. Security vulnerabilities: see
[`SECURITY.md`](./SECURITY.md) — please do not open a public issue for
those.
