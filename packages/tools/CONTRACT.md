# Tool contract & versioning rules

`@mobilerun/mcp-tools`' public contract is its tool surface: tool names,
input schema shapes, and output shapes (the JSON each tool's `content[0].text`
deserializes to). `src/__tests__/profile-golden.test.ts` pins the allowed operations +
input schemas of every profile and the full-profile tool descriptions so a
drift shows up as a diff in review, not silently downstream.

## SemVer rules

- **Major** (breaking):
  - Renaming or removing a tool.
  - Removing or renaming an input/output field.
  - Narrowing an input field's type (e.g. widening a required set, dropping
    an enum value that was previously valid input).
  - Making a previously-optional input field required.
  - Changing a field's semantic meaning without changing its name/type.
- **Minor** (additive, backward-compatible):
  - Adding a new tool.
  - Adding a new optional input field.
  - Adding a new enum value to an existing field (input or output).
  - Adding a new optional/additional field to a DTO's output shape.
  - Widening a required input field to optional.
- **Patch** (no shape change):
  - Description-only changes (tool description, field `.describe()` text).
  - Internal refactors with no observable schema/behavior change.

When a change spans categories, it's classified by its most severe bucket
(one major field change makes the whole release major, even alongside minor
additions).

## Deprecation policy

A tool or field is never removed in the same release it's deprecated:

1. Mark it deprecated — append a `Deprecated: <reason>. Use <replacement>
   instead.` sentence to its description (and, where practical, to the
   specific field's `.describe()`).
2. Ship at least one **minor** release with the deprecation notice live
   before the removal ships.
3. The removal itself is a **major** release, per the rules above.

When the upstream API removes an endpoint, the dependent tool, operation, or
field may be removed without a deprecation window because it can no longer
work. The removal still counts as breaking and is listed under **Removed** in
`CHANGELOG.md`.

## Bundle tools (`operation`/`resource` enums)

For bundle tools (`webhooks`, `list_workflow_resources`,
`get_workflow_resource`), each `operation`/`resource` enum value is treated
like its own semver surface:

- Adding a new value: minor.
- Removing/renaming a value the model could have been relying on: major,
  and subject to the deprecation policy above.

`Policy.operationAllowlist` (see `src/ctx.ts`) narrows which of a bundle
tool's enum values a given credential may use, at runtime — it is a
deployment/credential-scoping concern, not a contract change; the input
schema's enum always advertises the tool's full built-in surface (see the
comment in `src/tools/webhooks.ts` / `src/tools/workflows.ts` for why the
schema itself isn't narrowed per-policy).

## Ports vs. DTOs (`src/backend/*.ts`)

The `Backend` ports (`DevicesBackend`, `WorkflowsBackend`, `WebhooksBackend`,
`CredentialsBackend`) and their DTOs are a **semantic tool-capability
contract**, not a mirror of `@mobilerun/sdk`'s full response types. A DTO
carries only the fields the tools actually surface to the model. Extending
a DTO with a new optional field to surface more of the underlying API is a
minor change under the same rules as above; removing/renarrowing a DTO
field a tool already serializes is major.

## Updating the snapshot

When a change is intentional, regenerate the snapshot and review the diff
like any other contract change:

```bash
bun test packages/tools/src/__tests__/profile-golden.test.ts --update-snapshots
```

## Current version and tools

| Package | Version | Public client |
| --- | --- | --- |
| `@mobilerun/mcp-tools` | 0.5.0 | 6.0.0 |

The full profile registers 39 tools. The read-only profile registers 31,
and the no-commerce profile registers 37. Bundle schemas retain their full
operation enums; descriptions advertise the credential's allowed subset,
and dispatch rejects excluded values before invoking a backend.

Bundle inputs use flat top-level fields. For example, `manage_flow` update
accepts `{ "operation": "update", "flowId": "...", "name": "..." }`;
device bundles also keep `deviceId` at the top level.

Each bundle declares its operations once in a per-tool operation table.
An entry contains its Zod input fields, dispatch function, doc string and
`access: 'read' | 'write' | 'commerce'`. Assistant writes additionally keep
`fullOnly: true`, preserving their existing full-profile restriction.
`sdkOp` derives parsing and text results for SDK passthroughs;
`registerBundle` derives the enum, flat schema, description, field checks
and dispatch. Shared overrides retain union constraints and custom field
descriptions. Input fields have stable alphabetical traversal for JSON
Schema reference anchors; field errors follow table order and deduplicate
names. The flow-update entry maps activation payloads to the activate gate.
Static metadata in `src/tools/bundle-tools.ts` declares bundle selectors
and standalone access. It also derives the canonical tool-name tuple
without constructing a server. Add new bundles or standalone tools there;
profile golden tests pin allowed operations and description-free input
shapes for all three profiles.

Saved media downloads return short-lived signed URLs. Screenshot capture
returns PNG bytes as base64, capped at 2 MB. Upload bytes are sent
to signed upload URLs outside the tools. Credential retrieval exposes only
field metadata, using the existing redaction mechanism.

| Tool | Operation / resource / view / catalog values |
| --- | --- |
| `numbers` | operation: countries, capacity, list, get, create, update, delete, messages, send |
| `mailboxes` | operation: list, capacity, create, get, update, delete, uncancel, restart, disconnect, otp, messages, message, connect, connection |
| `messages` | operation: list, get, conversations, mark_read |
| `files` | operation: download, list, update, delete, cancel_pending, confirm, upload_url |
| `list_devices` | Standalone operation |
| `get_device` | Standalone operation |
| `get_device_screenshot` | Standalone operation |
| `get_device_ui_state` | Standalone operation |
| `list_apps_on_device` | Standalone operation |
| `create_device` | Standalone operation |
| `terminate_device` | Standalone operation |
| `list_workflow_resources` | resource: action_catalog, action, trigger, flow, execution, service, service_methods |
| `get_workflow_resource` | resource: action_catalog, action, trigger, flow, execution |
| `create_action` | Standalone operation |
| `create_trigger` | Standalone operation |
| `create_flow` | Standalone operation |
| `manage_flow` | operation: execution_screenshot, clone, unblock, add_action, remove_action, replace_actions, execution_metrics, update, delete, activate, run, validate, verify, dry_run, capacity, delivery_options, template_context, list_repairs, update_action, delete_action, update_trigger, delete_trigger, fire_trigger, abort_execution |
| `workflow_events` | operation: ingest, dry_run |
| `webhooks` | operation: create, list, get, update, rotate_secret, test, list_deliveries, get_delivery, delivery_stats, delete, deliveries, integrations, integration_targets |
| `assistant` | operation: list_sessions, create_session, update_session, send_message, get_messages, abort, answer_permission, answer_question, reject_question |
| `list_credentials` | Standalone operation |
| `list_credential_packages` | Standalone operation |
| `run_task` | Standalone operation |
| `get_task` | view: summary, status, trajectory |
| `list_tasks` | Standalone operation |
| `stop_task` | Standalone operation |
| `send_task_message` | Standalone operation |
| `get_task_media` | kind: screenshot, ui_state |
| `manage_device` | operation: recordings_trajectory, recordings_video, screenshots_image, reboot, reset, rename, wait_ready, get_capabilities, count, stop, resume, summary, retrieve_capabilities, recordings_list, recordings_delete, recordings_screenshots, recordings_start, recordings_status, recordings_stop, screenshots_list, screenshots_delete, screenshots_capture, traffic_sessions_create, traffic_sessions_retrieve, traffic_sessions_list, traffic_sessions_delete, media_sessions_create, media_sessions_delete, media_sessions_activate, media_sessions_retrieve_current |
| `device_action` | operation: tap, swipe, keyboard_write, keyboard_key, keyboard_clear, global_action, clipboard_get, clipboard_set, deep_link, browser_script |
| `manage_device_apps` | operation: install, delete, start, stop, list_packages, grant_permission, revoke_permission, list_installs |
| `manage_device_files` | operation: list, upload, download, delete |
| `configure_device` | operation: get_language, set_language, get_timezone, set_timezone, get_location, set_location, get_time, get_overlay, set_overlay, proxy_connect, proxy_disconnect, get_proxy_status, reset_location, kiosk_enable, kiosk_disable, update_profile |
| `manage_esim` | operation: list, activate, enable, remove, set_roaming, status, apn_list, apn_select, apn_set |
| `apps` | operation: list, get, versions, create_upload_url, confirm_upload, mark_failed, delete, storage_usage |
| `manage_credentials` | operation: init_package, create_credential, delete_credential, add_field, update_field, delete_field, get |
| `proxies` | operation: list, get, create, update, delete |
| `connect` | operation: list_countries, list_proxies, get_proxy, buy_proxy, cancel_proxy, ping_proxy, list_connections, list_users, get_user, list_user_connections, update_proxy, ensure_healthy |
| `platform_catalog` | catalog: models, timezones |
