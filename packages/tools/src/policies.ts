// Server-start policy profiles: the public server MUST always construct a
// concrete policy — `policy: undefined` would be fail-open (every tool
// registered), which is exactly the footgun `ToolCtx.policy` being a
// required field (see ctx.ts) is meant to prevent. `policyForProfile` is the
// single place that turns a profile name into the `Policy` the core's
// `enforcePolicy` (register.ts) fail-closed-enforces at registration time —
// both the HTTP and stdio hosts call this instead of hand-building a Policy,
// so the three profiles stay identical across transports.
//
// Every operation name below is verified directly against the merged
// `tools/*.ts` operation enums, not assumed — a handful of originally
// sketched operation names don't exist because the underlying SDK doesn't
// support them (see the header comments in tools/device-control.ts and
// backend/device-control.ts for the full list of dropped operations).
import type { Policy } from './ctx.js';
import { ALL_TOOL_NAMES, fullAccessPolicy } from './register.js';

export const POLICY_PROFILES = ['readonly', 'no-commerce', 'full'] as const;
export type PolicyProfile = (typeof POLICY_PROFILES)[number];

/** Tools that only ever read: list_/get_ prefixed standalone tools, plus
 * `platform_catalog` (read-only reference data, no create/update/delete
 * surface at all). Bundle tools with a mix of read and mutating operations
 * are NOT here — they're tool-allowlisted below with a per-tool
 * `operationAllowlist` entry instead. */
const READONLY_TOOL_NAMES = new Set<string>([
    'list_devices',
    'get_device',
    'get_device_screenshot',
    'get_device_ui_state',
    'list_apps_on_device',
    'list_workflow_resources',
    'get_workflow_resource',
    'list_credentials',
    'list_credential_packages',
    'get_task',
    'list_tasks',
    'get_task_media',
    'platform_catalog',
]);

/** Bundle tools included in `readonly` with their surface narrowed to read
 * operations only via `operationAllowlist` — the tool itself stays visible
 * (registered, listed) but a mutating operation is rejected at dispatch. */
const READONLY_BUNDLE_OPERATIONS = new Map<string, ReadonlySet<string>>([
    // create/update/rotate_secret/test are mutations.
    ['webhooks', new Set(['list', 'get', 'list_deliveries', 'get_delivery', 'delivery_stats', 'list_event_types'])],
    // reboot/reset/rename are mutations.
    ['manage_device', new Set(['count', 'get_capabilities', 'wait_ready'])],
    // install/delete/start/stop are mutations.
    ['manage_device_apps', new Set(['list_packages'])],
    // upload/delete are mutations.
    ['manage_device_files', new Set(['list', 'download'])],
    // set_*/proxy_connect/proxy_disconnect are mutations.
    ['configure_device', new Set(['get_language', 'get_timezone', 'get_location', 'get_time', 'get_overlay', 'get_proxy_status'])],
    // activate/enable/remove are mutations.
    ['manage_esim', new Set(['list'])],
    // create/update/delete/apply are mutations.
    ['profiles', new Set(['list', 'get'])],
    // create_upload_url/confirm_upload/mark_failed/delete are mutations.
    ['apps', new Set(['list', 'get', 'versions'])],
    // create/update/delete are mutations.
    ['proxies', new Set(['list', 'get', 'lookup'])],
    // buy_proxy/cancel_proxy are mutations.
    [
        'connect',
        new Set([
            'list_countries',
            'list_proxies',
            'get_proxy',
            'ping_proxy',
            'list_connections',
            'list_users',
            'get_user',
            'list_user_connections',
        ]),
    ],
    // clone/unblock/add_action/remove_action/replace_actions are mutations
    // (flow structure edits) — execution_metrics is the only read.
    ['manage_flow', new Set(['execution_metrics'])],
    // ingest/register_events are mutations; dry_run only simulates ingest,
    // list_event_types is a read.
    ['workflow_events', new Set(['list_event_types', 'dry_run'])],
]);

// `device_action` (pure input-injection: tap/swipe/keyboard/global_action —
// no read operation exists at all) and `manage_credentials` (every
// operation writes or deletes a secret) have no read subset, so neither
// appears in READONLY_TOOL_NAMES or READONLY_BUNDLE_OPERATIONS above —
// `readonly` excludes both tools entirely rather than gating operations.

/** Commerce-adjacent device lifecycle tools — provisioning/destroying a
 * billed device. Excluded from the `no-commerce` default and from
 * `readonly`; only `full` includes them. */
const COMMERCE_TOOL_NAMES = new Set<string>(['create_device', 'terminate_device']);

/** `connect` operations excluded from `no-commerce` — buying/cancelling a
 * proxy is a billed action; the `connect` tool otherwise stays fully
 * available. */
const NO_COMMERCE_CONNECT_OPERATIONS = new Set([
    'list_countries',
    'list_proxies',
    'get_proxy',
    'ping_proxy',
    'list_connections',
    'list_users',
    'get_user',
    'list_user_connections',
]);

function toolNames(filter: (name: string) => boolean): ReadonlySet<string> {
    return new Set(ALL_TOOL_NAMES.filter(filter));
}

/**
 * Builds the `Policy` for one of the three server-start profiles:
 *
 * - `readonly` — only list_/get_ tools and `platform_catalog`, plus the
 *   read operations of bundle tools (see `READONLY_BUNDLE_OPERATIONS`).
 *   `device_action` and `manage_credentials` have no read subset at all and
 *   are excluded outright.
 * - `no-commerce` (the required safe default) — everything
 *   except `create_device`/`terminate_device` (tool-level), and
 *   `connect`'s `buy_proxy`/`cancel_proxy` operations (operation-level —
 *   the `connect` tool itself stays visible).
 * - `full` — `fullAccessPolicy()`, i.e. every tool, no operation gates.
 */
export function policyForProfile(profile: PolicyProfile): Policy {
    switch (profile) {
        case 'full':
            return fullAccessPolicy();
        case 'no-commerce':
            return {
                toolAllowlist: toolNames((name) => !COMMERCE_TOOL_NAMES.has(name)),
                operationAllowlist: new Map([['connect', NO_COMMERCE_CONNECT_OPERATIONS]]),
            };
        case 'readonly':
            return {
                toolAllowlist: toolNames((name) => READONLY_TOOL_NAMES.has(name) || READONLY_BUNDLE_OPERATIONS.has(name)),
                operationAllowlist: READONLY_BUNDLE_OPERATIONS,
            };
    }
}
