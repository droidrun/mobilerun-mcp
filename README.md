# mobilerun-mcp

Public, curated MCP server for the Mobilerun platform, integrated. See
[`ROADMAP.md`](./ROADMAP.md) for the design (architecture, current state,
and what's planned next).

## Layout

- `packages/tools` (`@mobilerun/mcp-tools`) — auth-agnostic tool core. No
  hono, no SDK dependency, only `zod` + MCP SDK types. Exports
  `buildMcpServer(ctx, opts?)`, the `Backend` interface, and all 34 tools.
- `packages/server` (`@mobilerun/mcp-server`) — public composition: Bearer
  auth → `@mobilerun/sdk` client → `SdkBackend` → `ToolCtx` →
  `buildMcpServer`. Ships both an HTTP (Streamable HTTP, stateless) and a
  stdio transport.

## Setup

```bash
pnpm install
pnpm run typecheck
bun test
```

Runtime is Bun (`bun run`, `bun test`) — pnpm is only the installer.

## Running

### HTTP (Streamable HTTP, stateless)

```bash
cd packages/server
PORT=8080 bun run src/index.ts
```

- `GET /health` — liveness, not auth-gated.
- `POST /mcp` — MCP Streamable HTTP endpoint, **stateless JSON mode only**.
  Every request opens a fresh `McpServer` + transport (no session state, no
  key caching across requests) and builds a fresh `@mobilerun/sdk` client
  from the request's bearer key.
- `GET /mcp`, `DELETE /mcp` — `405`. A fresh-server-per-request design has no
  session/stream state for a GET (SSE) or DELETE (session-terminate) request
  to act on, so both are explicit `405`s rather than silently accepted.

### Baseline limits (every request, before the request reaches `handleMcp`)

- Request body over `MCP_BODY_LIMIT_BYTES` (default 1 MiB) → `413`.
- No response within `MCP_REQUEST_TIMEOUT_MS` (default 60s) → `504`.
- Per-request-IP and per-API-key-hash token-bucket rate limits
  (`MCP_RATE_LIMIT_PER_IP_PER_MIN` / `MCP_RATE_LIMIT_PER_KEY_PER_MIN`,
  defaults 120/60 req/min, burst = the limit itself) → `429` +
  `Retry-After: <seconds>`. In-process only (per replica, not distributed) —
  see `packages/server/src/rate-limit.ts`'s file header for why. A
  distributed, weighted limiter (cost per tool, concurrency, org budgets) is
  a deployment-layer concern this floor doesn't replace.

### stdio (local use)

```bash
cd packages/server
MOBILERUN_CLOUD_API_KEY=<key> bun run src/stdio.ts
```

## Auth

Two ways to present the API key on the HTTP transport, and they must be
disjoint — presenting both is a `400`, not "Authorization wins":

- `Authorization: Bearer <key>` (standard MCP client convention)
- `x-mobilerun-cloud-api-key: <key>` (matches `@mobilerun/sdk`'s own env var
  name, for clients that can't set arbitrary `Authorization` headers)

**Bearer channel separation:** a `dr_sk_`-prefixed credential is treated as a
Mobilerun API key. Any other bearer value is rejected with `400` — this
server does not yet validate OAuth 2.1 bearer tokens (see `ROADMAP.md` for
the plan).

**Error taxonomy** (`packages/server/src/auth.ts`):

| Condition | Status | Notes |
|---|---|---|
| No credential presented | `401` | `WWW-Authenticate: Bearer resource_metadata="<MCP_RESOURCE_URL>/.well-known/oauth-protected-resource"` — the resource URL is always read from `MCP_RESOURCE_URL` config, **never** from the request's `Host`/`Forwarded` headers. |
| Malformed `Authorization` header | `400` | e.g. not `Bearer <token>` |
| Both `Authorization` and `x-mobilerun-cloud-api-key` present | `400` | ambiguous credential, rejected rather than resolved by precedence |
| Bearer present but not `dr_sk_`-prefixed | `400` | OAuth 2.1 bearer tokens aren't supported yet |
| Body over the size limit | `413` | see Baseline limits above |
| Rate limit exceeded | `429` | `Retry-After: <seconds>` |
| Request exceeds `MCP_REQUEST_TIMEOUT_MS` | `504` | |

This server does not yet implement full RFC 9728/OAuth 2.1 validation
(`.well-known/oauth-protected-resource` itself isn't served yet either) —
only the error *shapes* the spec requires, ahead of full OAuth support.

The stdio transport takes the key from `MOBILERUN_CLOUD_API_KEY` in the
process environment (no per-call header, since stdio has no request/response
HTTP envelope) — local-only fallback, not used by the HTTP transport.

## Environment (packages/server)

| Var | Default | Notes |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `NODE_ENV` | `development` | `development \| test \| production` |
| `LOG_LEVEL` | `info` | `debug \| info \| warn \| error` |
| `MOBILERUN_BASE_URL` | `https://api.mobilerun.ai/v1` | Passed straight to the SDK client |
| `MOBILERUN_CLOUD_API_KEY` | — | stdio transport only; HTTP always takes the key from the request |
| `MCP_POLICY_PROFILE` | `no-commerce` | `readonly \| no-commerce \| full` — which tools/operations this deployment ever registers, before any per-credential scoping. Defaults to the safe `no-commerce` profile; an operator opts into `full` explicitly. See "Policy profiles" below. |
| `MCP_RESOURCE_URL` | `http://localhost:8080` | Canonical resource identifier for the `WWW-Authenticate`/RFC 9728 URL. **Never** derived from request headers — set this to the server's real public URL in any non-local deployment. |
| `MCP_BODY_LIMIT_BYTES` | `1048576` (1 MiB) | POST `/mcp` body size limit |
| `MCP_REQUEST_TIMEOUT_MS` | `60000` | Hard per-request timeout around the MCP request handler |
| `MCP_RATE_LIMIT_PER_KEY_PER_MIN` | `60` | Token-bucket capacity+refill per API-key hash |
| `MCP_RATE_LIMIT_PER_IP_PER_MIN` | `120` | Token-bucket capacity+refill per client IP |
| `MCP_TRUST_PROXY` | `false` | Whether to trust `X-Forwarded-For`/`X-Real-IP` for IP rate limiting. Unguarded, those headers are caller-spoofable (bypass the IP limiter, or frame another IP's bucket) — only set `true` behind a proxy/LB that overwrites (never appends-to) them. When `false` (default), the IP limiter uses only the actual socket peer address (`Bun.serve`'s `server.requestIP`, wired via `index.ts`); if that's unavailable for a request, the IP limiter is skipped for it (never a shared `"unknown"` bucket) and per-key limiting still applies. |

Validated with `zod` + `safeParse` at startup (`env.ts`) — an invalid config
fails fast (`process.exit(1)`) rather than serving with a bad default.

## Tools (34 total)

| Tool | Domain | Notes |
|---|---|---|
| `list_devices`, `get_device`, `get_device_screenshot`, `get_device_ui_state`, `list_apps_on_device`, `create_device`, `terminate_device` | Devices | |
| `list_workflow_resources`, `get_workflow_resource`, `create_action`, `create_trigger`, `create_flow` | Workflows | |
| `manage_flow` | Workflows | Bundle: `operation ∈ clone, unblock, add_action, remove_action, replace_actions, execution_metrics` |
| `workflow_events` | Workflows | Bundle: `operation ∈ ingest, dry_run, list_event_types, register_events` |
| `webhooks` | Webhooks | Bundle: `operation ∈ create, list, get, update, rotate_secret, test, list_deliveries, get_delivery, delivery_stats, list_event_types` |
| `list_credentials`, `list_credential_packages` | Credentials | |
| `manage_credentials` | Credentials | Bundle write path: `operation ∈ init_package, create_credential, delete_credential, add_field, update_field, delete_field`. Never echoes a field value back |
| `run_task`, `get_task`, `list_tasks`, `stop_task`, `send_task_message`, `get_task_media` | Tasks | `get_task(view ∈ summary, status, trajectory)`, `get_task_media(kind ∈ screenshot, ui_state)` |
| `manage_device` | Device-control | Bundle: `operation ∈ reboot, reset, rename, wait_ready, get_capabilities, count` |
| `device_action` | Device-control | Bundle: `operation ∈ tap, swipe, keyboard_write, keyboard_key, keyboard_clear, global_action`. Low-level input injection — excluded from `readonly` (no read operation exists) |
| `manage_device_apps` | Device-control | Bundle: `operation ∈ install, delete, start, stop, list_packages` |
| `manage_device_files` | Device-control | Bundle: `operation ∈ list, upload, download, delete` |
| `configure_device` | Device-control | Bundle: `operation ∈ get_language, set_language, get_timezone, set_timezone, get_location, set_location, get_time, get_overlay, set_overlay, proxy_connect, proxy_disconnect, get_proxy_status` |
| `manage_esim` | Device-control | Bundle: `operation ∈ list, activate, enable, remove` |
| `apps` | Platform | Bundle: `operation ∈ list, get, versions, create_upload_url, confirm_upload, mark_failed, delete` |
| `proxies` | Platform | Bundle: `operation ∈ list, get, create, update, delete, lookup` — device-proxy configs (socks5/wireguard) |
| `connect` | Platform | Bundle: `operation ∈ list_countries, list_proxies, get_proxy, buy_proxy, cancel_proxy, ping_proxy, list_connections, list_users, get_user, list_user_connections`. `buy_proxy`/`cancel_proxy` are billed — denied under `no-commerce`. User mutations (`create_user`/`update_user`/`delete_user`) are intentionally not exposed — not public product surface |
| `platform_catalog` | Platform | Read-only bundle: `catalog ∈ models, timezones, app_event_types` |

See inline file-header comments in `packages/tools/src/tools/*.ts` for the
per-tool design notes, and `packages/server/src/sdk-backend/workflows.ts`
for the two open SDK-mapping gaps (`list_credential_packages` has no direct
SDK endpoint; `create_trigger`'s `scheduleRule.jitter` isn't in the public
SDK's typed params). See `ROADMAP.md` for the consolidated list of tools
that are awaiting SDK support (recordings, deeplink, browser execute-script,
app permissions, eSIM APN/roaming/connectivity, kiosk, location reset,
`app_store`, apps storage-usage, `list_app_events` — none of these are
exposed as tools; no SDK support exists for them yet).

## Policy / allowlisting (fail-closed at registration)

`ToolCtx.policy` is **required** (not optional) and has two levels, both
enforced by `packages/tools/src/register.ts`'s `enforcePolicy` before any
tool handler ever runs:

- **Tool-level** — `policy.toolAllowlist: ReadonlySet<string>`. A tool name
  outside the set is never usably registered: it's absent from `tools/list`
  and a direct `tools/call` for it fails with the MCP SDK's own "Tool X not
  found" error, not a custom "denied" result — there's no handler to run.
  An **empty** `toolAllowlist` therefore registers nothing at all. There is
  no implicit "everything" default; a host that wants full access calls
  `fullAccessPolicy()` explicitly.
- **Operation-level** — `policy.operationAllowlist?: ReadonlyMap<string,
  ReadonlySet<string>>`, for the bundle tools (`webhooks`,
  `list_workflow_resources`, `get_workflow_resource`). An entry for a tool
  name restricts which `operation`/`resource` values are dispatchable; a
  value outside the set is rejected with a typed error result before the
  backend is called. The tool's *description* also lists the allowed subset
  when narrowed — the zod input schema itself intentionally stays the full
  enum (see the comment in `tools/webhooks.ts` / `tools/workflows.ts`): a
  policy-narrowed schema would make an out-of-policy value fail generic
  zod/MCP input validation *before* reaching the dispatch-time gate, which
  is where the actual enforcement (and its audit event) lives.

### Policy profiles

The HTTP and stdio servers build their `Policy` via `policyForProfile(env.MCP_POLICY_PROFILE)`
(`packages/tools/src/policies.ts`), one of three profiles:

| Profile | Tool count | Notes |
|---|---|---|
| `readonly` | 24 | `list_*`/`get_*` tools, `platform_catalog`, plus 11 bundle tools narrowed to their read operations via `operationAllowlist` (`webhooks`, `manage_device`, `manage_device_apps`, `manage_device_files`, `configure_device`, `manage_esim`, `apps`, `proxies`, `connect`, `manage_flow`, `workflow_events`). `device_action` and `manage_credentials` are excluded outright — neither has a read-only operation. |
| `no-commerce` (**default**) | 32 | Everything except `create_device`, `terminate_device` (tool-level), and `connect`'s `buy_proxy`/`cancel_proxy` operations (operation-level — the `connect` tool itself stays visible). The required safe default — a server that never sets `MCP_POLICY_PROFILE` must not fail open to `full`. |
| `full` | 34 | Every tool, no operation gates — `fullAccessPolicy()`, opt-in only. |

Set `MCP_POLICY_PROFILE=readonly|no-commerce|full` to choose; both the HTTP
and stdio transports read the same env var, so they stay in lockstep.

`buildMcpServer`'s `opts.wrapRegisterTool` hook is the composition point for
a host's own `registerTool` wrapper (e.g. plugging in metrics or its own
tier gate) — see `ROADMAP.md` for the composition model.

## Auth context

`ToolCtx.auth: AuthContext` is also required — `{ kind: 'api_key' | 'oauth'
| 'machine', subject, ownerId?, clientId?, scopes?, tokenId?, expiresAt? }`.
Build it via `createAuthContext(...)`, which enforces that `ownerId` is
present for `kind: 'oauth' | 'machine'` (those credentials are always
org-scoped) — optional for `kind: 'api_key'`, where the public API enforces
tenancy itself via key scoping and this resource server never learns the
org. The HTTP/stdio server builds `{ kind: 'api_key', subject: 'api-key' }`.

## Typed backend ports & errors

`packages/tools/src/backend/{devices,workflows,webhooks,credentials}.ts`
(barrel: `backend/index.ts`) define the `Backend` ports as **minimal DTOs**,
not a mirror of `@mobilerun/sdk`'s full response types — only the fields the
tools actually surface. `packages/server/src/sdk-backend/` mirrors the same
per-domain split for the `SdkBackend` implementation over `@mobilerun/sdk`,
wrapped in `withBackendErrors` (`sdk-backend/errors.ts`) so a thrown SDK
error becomes a typed `BackendError` (`code: 'not_found' | 'forbidden' |
'rate_limited' | 'upstream_error' | 'invalid_input'`) before it reaches the
tool layer. `asErrorResult` (`text-result.ts`) renders any `BackendError`
uniformly as `[code] message`, regardless of which backend produced it. This
per-domain split is deliberate: a new domain adds
one `backend/<domain>.ts` + one `sdk-backend/<domain>.ts` + a one-line barrel
registration in each `index.ts`, keeping the conflict surface for parallel
domain work small.

## Audit telemetry

`BuildMcpServerOpts.onToolCall?: (event: ToolCallEvent) => void` fires once
per tool call with `{ toolName, operation?, outcome: 'ok'|'error'|'denied',
durationMs, requestId?, auth: {kind, subject, ownerId?, clientId?} }` —
**never** token, call arguments, or secrets. The HTTP/stdio server wires
this to a structured JSON line on **stderr** (`audit-log.ts`) — deliberately
never stdout, since the stdio transport reserves stdout exclusively for
JSON-RPC framing (a stray stdout line there corrupts the protocol stream);
this package's `log()` helper (`log.ts`) follows the same rule for every log
level, not just warn/error. A host with its own observability stack can swap
the audit sink for a real exporter without touching the core.

## Contract & versioning

See [`packages/tools/CONTRACT.md`](./packages/tools/CONTRACT.md) for the
semver rules (tool rename/removal = major, new tool/optional field/enum
value = minor, description-only = patch) and the deprecation policy.
`packages/tools/src/__tests__/schema-snapshot.test.ts` snapshots the
full-access tool surface (names + input schemas) so an unintended shape
change fails CI as a snapshot diff.
