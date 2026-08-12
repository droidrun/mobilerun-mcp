# Roadmap

`mobilerun-mcp` is a curated MCP (Model Context Protocol) server for the
Mobilerun platform API: devices, workflows, webhooks, credentials, tasks,
device control, profiles, apps, proxies, connect, and platform catalog data,
exposed as a set of well-scoped MCP tools an LLM agent can call.

## Architecture

- **Auth-agnostic tool core** (`packages/tools`, `@mobilerun/mcp-tools`) —
  has no opinion about how a caller authenticates or which backend serves a
  request. It defines a `Backend` port per domain (devices, workflows,
  webhooks, credentials, tasks, device-control, profiles, apps, proxies,
  connect, platform-catalog), a `ToolCtx` (backend + auth context + policy),
  and `buildMcpServer(ctx, opts?)`, which registers every tool against an
  MCP `McpServer` instance.
- **Server composition** (`packages/server`, `@mobilerun/mcp-server`) — wires
  a concrete backend (`SdkBackend`, built on the public `@mobilerun/sdk`
  client) and a concrete auth strategy (Bearer API key today) into the core,
  and exposes it over both an HTTP (Streamable HTTP, stateless) and a stdio
  transport.
- **Policy profiles** — the server always constructs an explicit `Policy`
  before registering any tool. Three profiles ship today: `readonly`,
  `no-commerce` (the default), and `full`. A policy has two levels: which
  tools are registered at all, and — for bundle tools with an
  `operation`/`resource` enum — which individual operation values are
  dispatchable.
- **Fail-closed gates** — an unset policy is a type error, not an implicit
  "everything allowed" default; an empty policy registers nothing. Tools
  outside the allowlist are never reachable via `tools/list` or `tools/call`
  — enforcement happens at registration time, in the core, not as an
  after-the-fact filter a host could accidentally skip. The composition hook
  a host uses to add its own `registerTool` wrapper (for metrics or an
  additional gate of its own) runs *after* this core policy gate, never
  instead of it.

## What exists today

- **35 tools** across devices, workflows, webhooks, credentials, tasks,
  device-control, profiles, apps, proxies, connect, and platform catalog.
  See the README's tool table for the full list and each bundle tool's
  operation enum.
- **Three policy profiles**: `readonly` (25 tools), `no-commerce` (33 tools,
  the default), `full` (35 tools). See the README for exactly what each
  profile excludes.
- **Two transports**: stateless Streamable HTTP (`POST /mcp`, `GET`/`DELETE`
  return `405`) and stdio.
- **API-key auth** on the HTTP transport, via `Authorization: Bearer
  <dr_sk_...>` or `x-mobilerun-cloud-api-key`.
- **Baseline server-side hardening**: request body size cap, request
  timeout, per-IP and per-API-key token-bucket rate limiting, structured
  audit telemetry per tool call (no tokens/args/secrets), and typed backend
  errors instead of raw upstream error passthrough.

## Planned: OAuth 2.1 (MCP Authorization spec)

The next major auth milestone is OAuth 2.1 support alongside the existing
API-key path, following the MCP Authorization specification:

- This server acts as a **Resource Server**, not an Authorization Server. It
  will serve its own **Protected Resource Metadata** (RFC 9728) at
  `/.well-known/oauth-protected-resource`, and 401 responses will carry a
  `WWW-Authenticate: Bearer resource_metadata="..."` header so compliant MCP
  clients can bootstrap the auth flow themselves.
- **Audience binding is not optional.** The spec requires the `resource`
  parameter (RFC 8707) on both the authorize and token requests, plus a
  server-side audience check on every validated token — a token whose `aud`
  doesn't exactly match this server's canonical resource URI is rejected as
  `invalid_token`.
- **Token validation** is planned as introspection-first: this server
  validates opaque access tokens against an introspection endpoint rather
  than doing local JWT/JWKS validation, for immediate revocation visibility
  with less coordination required on the authorization-server side. Local
  JWT validation may follow later as an optimization.
- **No token passthrough.** The validated OAuth token this server receives
  is never forwarded as-is to the upstream platform API — that's explicitly
  forbidden by the spec. A separate credential-broker step exchanges the
  validated identity for a scoped upstream credential instead.
- **Scopes map to policy profiles.** An OAuth scope set (e.g. `mcp:read`,
  `mcp:devices`, `mcp:commerce`) will resolve to the same `Policy` shape
  (`toolAllowlist` + `operationAllowlist`) the profile system already uses —
  unknown or empty scopes resolve to an empty allowlist, never "no
  restriction."
- **stdio stays API-key-only** — OAuth is inherently an HTTP-transport
  concept.

This depends on authorization-server capabilities (audience binding,
introspection, hardened dynamic client registration) that don't fully exist
yet on the platform side; the resource-server-side work in this repo is
designed and scoped, but gated on that upstream support landing.

## Planned tools awaiting SDK support

The following tool surfaces are designed but not yet built, because the
public `@mobilerun/sdk` doesn't yet expose the underlying operations:

- **`device_recordings`** — list/start/get/stop/delete a device session
  recording, plus its trajectory and video. No recordings resource exists
  in the SDK yet.
- **Deeplink / browser script actions** on `device_action` — opening a
  deeplink or executing a browser script on-device. No SDK method exists
  for either yet.
- **App permission management** on `manage_device_apps` — granting/revoking
  a specific permission, and listing install records. Not yet exposed by
  the SDK.
- **eSIM APN / roaming / connectivity-status** on `manage_esim` — only
  list/activate/enable/remove exist today; APN configuration, roaming
  control, and a connectivity-status read are not yet in the SDK.
- **Kiosk mode** on `configure_device` — enabling/disabling kiosk mode has
  no SDK method yet.
- **`app_store`** — browsing and adding from a curated app store. No SDK
  binding exists for this yet.

Each of these is called out with the exact verified gap in the relevant
source file's header comment (see `packages/tools/src/tools/device-control.ts`
and `packages/tools/src/backend/apps.ts`, for example) — they're deliberate
omissions, not oversights, and will be built out as SDK support lands.
