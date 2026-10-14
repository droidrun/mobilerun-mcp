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
// `tools/*.ts` operation enums. Removed upstream operations are not allowlisted.
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

const ASSISTANT_READ_OPERATIONS = new Set(['list_sessions', 'get_messages']);

/** Bundle tools included in `readonly` with their surface narrowed to read
 * operations only via `operationAllowlist` — the tool itself stays visible
 * (registered, listed) but a mutating operation is rejected at dispatch. */
const READONLY_BUNDLE_OPERATIONS = new Map<string, ReadonlySet<string>>([
    ['files', new Set(['list', 'download'])],
    ['device_action', new Set(['clipboard_get'])],
    ['messages', new Set(['list', 'get', 'conversations'])],
    ['manage_credentials', new Set(['get'])],
    ['numbers', new Set(['countries', 'capacity', 'list', 'get', 'messages'])],
    ['mailboxes', new Set(['list', 'capacity', 'get', 'otp', 'messages', 'message', 'connection'])],
    // create/update/rotate_secret/test are mutations.
    [
        'webhooks',
        new Set([
            'deliveries',
            'integrations',
            'integration_targets',
            'list',
            'get',
            'list_deliveries',
            'get_delivery',
            'delivery_stats',
        ]),
    ],
    ['assistant', ASSISTANT_READ_OPERATIONS],
    // reboot/reset/rename are mutations.
    [
        'manage_device',
        new Set([
            'summary',
            'retrieve_capabilities',
            'recordings_list',
            'recordings_screenshots',
            'recordings_status',
            'screenshots_list',
            'traffic_sessions_retrieve',
            'traffic_sessions_list',
            'media_sessions_retrieve_current',
            'screenshots_image',
            'recordings_video',
            'recordings_trajectory',
            'count',
            'get_capabilities',
            'wait_ready',
        ]),
    ],
    // install/delete/start/stop are mutations.
    ['manage_device_apps', new Set(['list_installs', 'list_packages'])],
    // upload/delete are mutations.
    ['manage_device_files', new Set(['list', 'download'])],
    // set_*/proxy_connect/proxy_disconnect are mutations.
    [
        'configure_device',
        new Set(['get_language', 'get_timezone', 'get_location', 'get_time', 'get_overlay', 'get_proxy_status']),
    ],
    // activate/enable/remove are mutations.
    ['manage_esim', new Set(['status', 'apn_list', 'list'])],
    // create_upload_url/confirm_upload/mark_failed/delete are mutations.
    ['apps', new Set(['storage_usage', 'list', 'get', 'versions'])],
    // create/update/delete are mutations.
    ['proxies', new Set(['list', 'get'])],
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
    // Configuration and execution changes mutate state; validation and simulation do not.
    [
        'manage_flow',
        new Set([
            'validate',
            'dry_run',
            'capacity',
            'delivery_options',
            'template_context',
            'list_repairs',
            'execution_screenshot',
            'execution_metrics',
        ]),
    ],
    // ingest is a mutation; dry_run only simulates ingest,
    // dry_run has no side effects.
    ['workflow_events', new Set(['dry_run'])],
]);

// Mixed input and credential bundles expose only their read operations in readonly.

/** Commerce-adjacent device lifecycle tools — provisioning/destroying a
 * billed device. Excluded from the `no-commerce` default and from
 * `readonly`; only `full` includes them. */
const COMMERCE_TOOL_NAMES = new Set<string>(['create_device', 'terminate_device']);

/** `connect` operations excluded from `no-commerce` — buying/cancelling a
 * proxy is a billed action; the `connect` tool otherwise stays fully
 * available. */
const NO_COMMERCE_CONNECT_OPERATIONS = new Set([
    'update_proxy',
    'ensure_healthy',
    'list_countries',
    'list_proxies',
    'get_proxy',
    'ping_proxy',
    'list_connections',
    'list_users',
    'get_user',
    'list_user_connections',
]);

const NO_COMMERCE_NUMBERS_OPERATIONS = new Set(['countries', 'capacity', 'list', 'get', 'update', 'messages']);
const NO_COMMERCE_MAILBOXES_OPERATIONS = new Set([
    'list',
    'capacity',
    'get',
    'update',
    'disconnect',
    'otp',
    'messages',
    'message',
    'connect',
    'connection',
]);
const NO_COMMERCE_MANAGE_DEVICE_OPERATIONS = new Set([
    'recordings_trajectory',
    'recordings_video',
    'screenshots_image',
    'reboot',
    'reset',
    'rename',
    'wait_ready',
    'get_capabilities',
    'count',
    'summary',
    'retrieve_capabilities',
    'recordings_list',
    'recordings_delete',
    'recordings_screenshots',
    'recordings_start',
    'recordings_status',
    'recordings_stop',
    'screenshots_list',
    'screenshots_delete',
    'screenshots_capture',
    'traffic_sessions_create',
    'traffic_sessions_retrieve',
    'traffic_sessions_list',
    'traffic_sessions_delete',
    'media_sessions_create',
    'media_sessions_delete',
    'media_sessions_activate',
    'media_sessions_retrieve_current',
]);
const NO_COMMERCE_MANAGE_ESIM_OPERATIONS = new Set([
    'list',
    'enable',
    'remove',
    'set_roaming',
    'status',
    'apn_list',
    'apn_select',
    'apn_set',
]);
const NO_COMMERCE_MANAGE_FLOW_OPERATIONS = new Set([
    'execution_screenshot',
    'clone',
    'unblock',
    'add_action',
    'remove_action',
    'replace_actions',
    'execution_metrics',
    'update',
    'delete',
    'validate',
    'dry_run',
    'capacity',
    'delivery_options',
    'template_context',
    'list_repairs',
    'update_action',
    'delete_action',
    'update_trigger',
    'delete_trigger',
    'abort_execution',
]);

function toolNames(filter: (name: string) => boolean): ReadonlySet<string> {
    return new Set(ALL_TOOL_NAMES.filter(filter));
}

/**
 * Builds the `Policy` for one of the three server-start profiles:
 *
 * - `readonly` — only list_/get_ tools and `platform_catalog`, plus the
 *   read operations of bundle tools (see `READONLY_BUNDLE_OPERATIONS`).
 *   Mixed device and credential bundles expose only their read subsets.
 * - `no-commerce` (the required safe default) — everything
 *   except `create_device`/`terminate_device` (tool-level),
 *   billed number/mailbox/eSIM/device operations, `connect` purchases, and assistant
 *   write operations (operation-level).
 * - `full` — `fullAccessPolicy()`, i.e. every tool, no operation gates.
 */
export function policyForProfile(profile: PolicyProfile): Policy {
    switch (profile) {
        case 'full':
            return fullAccessPolicy();
        case 'no-commerce':
            return {
                toolAllowlist: toolNames((name) => !COMMERCE_TOOL_NAMES.has(name)),
                operationAllowlist: new Map([
                    ['connect', NO_COMMERCE_CONNECT_OPERATIONS],
                    ['numbers', NO_COMMERCE_NUMBERS_OPERATIONS],
                    ['mailboxes', NO_COMMERCE_MAILBOXES_OPERATIONS],
                    ['manage_device', NO_COMMERCE_MANAGE_DEVICE_OPERATIONS],
                    ['manage_esim', NO_COMMERCE_MANAGE_ESIM_OPERATIONS],
                    ['manage_flow', NO_COMMERCE_MANAGE_FLOW_OPERATIONS],
                    ['assistant', ASSISTANT_READ_OPERATIONS],
                ]),
            };
        case 'readonly':
            return {
                toolAllowlist: toolNames(
                    (name) => READONLY_TOOL_NAMES.has(name) || READONLY_BUNDLE_OPERATIONS.has(name),
                ),
                operationAllowlist: READONLY_BUNDLE_OPERATIONS,
            };
    }
}
