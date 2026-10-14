# Changelog

All notable changes to `@mobilerun/mcp-tools` are documented here.

## [Unreleased]

### Changed

- Internal: tool operations are declared in per-tool operation tables; tool schemas and profiles are unchanged.

## [0.5.0] - 2026-10-14

### Removed

- **Breaking (embedders):** Removed export `ProxyLookupParams` and port methods `lookupProxy`, `listWebhookEventTypes`, and `listAppEventCatalog`. `CredentialPackageListDto.derived` is now `boolean`. Replaced the `DeviceType` union with canonical device types. `Backend` requires `files`, `messages`, `mailboxes`, and `numbers` members, and the corresponding ports require the new methods listed below; device-control and workflow ports also require the new lifecycle, media, connectivity, and execution methods. Parameterless methods take no empty object, and account device summary takes no device id.
- **Breaking:** `workflow_events.list_event_types`, `list_workflow_resources` resource `app_event_catalog`, and its `platform_catalog.app_event_types` alias — removed upstream in the API client 6.0.
- **Breaking:** `webhooks.list_event_types` — removed upstream in the API client 6.0.
- **Breaking:** `proxies.lookup` and its `lookupUser`/`lookupPassword` inputs — removed upstream in the API client 6.0.
- **Breaking:** Retired `dedicated_*` device-type inputs, which are rejected upstream in the API client 6.0. Device creation and listing now accept canonical device types.

### Added

- `numbers`: country availability, included capacity, owned numbers, paid purchases and cancellation, display labels, and received/sent SMS.
- `mailboxes`: capacity, creation and lifecycle management, external inbox connections, email messages and recent codes.
- `messages`: organization SMS inbox, conversation pagination, and read watermarks.
- `files`: organization files, signed upload/download URLs, upload confirmation/cancellation, and metadata updates.
- Device stop/resume and summary, supported features, clipboard, app links, browser scripts, app permissions and installation jobs, kiosk settings, profile updates, eSIM roaming/status and access point settings, recordings, screenshots, traffic sessions and media sessions.
- Flow configuration, validation, verification, activation, execution, simulation, capacity, delivery options, template context and repair suggestions; action/trigger updates and deletion, trigger firing, execution abort and screenshot URLs.
- Webhook deletion, organization delivery history and connected integration targets; app storage usage; residential proxy updates and health repair; direct credential package listing and credential metadata retrieval.
- Read-only access to new reads and explicit operation gates for billed actions, including phone/mailbox purchases and cancellation, mailbox restart/uncancel, SMS sending, eSIM activation, device stop/resume and flow execution operations.

### Changed

- The server uses `@mobilerun/sdk` 6.0.0.
- `pacedInput` now maps to `humanize` for device actions, keyboard input and task requests. Deprecated `stealth` is no longer sent; existing task result fields are preserved.
- App version responses support `pruned`, and webhook URLs may be null.
- Screenshot tools return bounded PNG image content blocks. Bundle operation inputs use flat top-level fields.
- Conversation creation sends its idempotency key as a request header.
- `list_credential_packages` uses direct package listing and returns `derived: false`.

## [0.4.0] - 2026-10-09

### Changed

- **Breaking:** `device_action` and `run_task` input `stealth` renamed to `pacedInput`. The value is still sent to the API as `stealth`; task results keep their `stealth` field. Shipped without a deprecation window so the old name no longer appears in tool descriptions.
- Tool and input descriptions reworded for clarity.

## [0.3.0] - 2026-09-30

### Added

- `assistant` tool for listing, creating, and updating sessions; sending messages with `running` responses and polling; reading messages with pending questions and permissions; aborting turns; answering or rejecting questions; and answering permissions with `once` or `reject`. Write operations require the `full` profile.
- SDK `@mobilerun/sdk` 5.5.

### Removed

- **Breaking:** `workflow_events` `register_events` operation and the `source`, `page`, and `pageSize` inputs of `list_event_types`; the upstream endpoints no longer exist, and `list_event_types` now reads the static app event catalog.

### Changed

- `list_tasks` rejects `status=paused` with `invalid_input`; the status is no longer filterable upstream.

## [0.2.0] - 2026-09-30

### Added

- Stable per-step keys for workflow flows and actions, with validation and deterministic derivation for `add_action` and `replace_actions`. Step outputs can be referenced as `{{steps.<key>.body.<field>}}`, and replacements carry keys forward for identified existing steps.
