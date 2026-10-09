# Changelog

All notable changes to `@mobilerun/mcp-tools` are documented here.

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
