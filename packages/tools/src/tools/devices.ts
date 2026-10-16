// Device tools delegate lifecycle and billing checks to the platform API.
// Screenshot results use the shared bounded PNG capture path.
// Device types use public identifiers translated by the backend adapter.

// The exact set @mobilerun/sdk's DeviceListParams.state accepts (9 values).
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ToolCtx } from '../ctx.js';
import { asTextResult, ifDefined } from '../text-result.js';
import { compactUiState, type RawUiStateResponse, type UiStateFilter } from './ui-state.js';

const DEVICE_STATES = [
    'creating',
    'assigned',
    'ready',
    'rebooting',
    'migrating',
    'resetting',
    'terminated',
    'maintenance',
    'unknown',
] as const;

// Keep aligned with the backend port's public DeviceType union.
const DEVICE_TYPES = [
    'android_cloud_phone',
    'android_physical_phone',
    'ios_phone',
    'android_emulator',
    'ios_simulator',
    'device_slot',
] as const;

const DEFAULT_LIST_STATES = DEVICE_STATES.filter((state) => state !== 'terminated');

function resolveListStates(state?: readonly (typeof DEVICE_STATES)[number][]) {
    return state && state.length > 0 ? state : DEFAULT_LIST_STATES;
}

export function registerDeviceTools(server: McpServer, ctx: ToolCtx): void {
    server.registerTool(
        'list_devices',
        {
            description:
                'List devices. Filters: state, type, name (substring), country (ISO). Paginated. ' +
                'Omitting `state` (or passing an empty array) returns every supported state except `terminated`; ' +
                'devices already terminating may also not appear.',
            inputSchema: {
                state: z.array(z.enum(DEVICE_STATES)).optional(),
                type: z.enum(DEVICE_TYPES).optional(),
                name: z.string().optional(),
                country: z.string().optional(),
                page: z.number().int().positive().optional().describe('1-based.'),
                pageSize: z.number().int().positive().optional(),
            },
        },
        async (opts) =>
            asTextResult(
                await ctx.backend.devices.listDevices({
                    ...opts,
                    state: resolveListStates(opts.state),
                }),
            ),
    );

    server.registerTool(
        'get_device',
        {
            description: 'Fetch one device by id.',
            inputSchema: { deviceId: z.string() },
        },
        async ({ deviceId }) => asTextResult(await ctx.backend.devices.getDevice(deviceId)),
    );

    server.registerTool(
        'get_device_screenshot',
        {
            description: 'Capture a device screenshot. Returns a PNG image (up to 256 KB).',
            inputSchema: { deviceId: z.string() },
        },
        async ({ deviceId }) => {
            const result = await ctx.backend.devices.getDeviceScreenshot(deviceId);
            return { content: [{ type: 'image' as const, data: result.screenshot, mimeType: 'image/png' }] };
        },
    );

    server.registerTool(
        'get_device_ui_state',
        {
            description:
                'Read the on-screen UI as structured text: current app/activity, keyboard state, and a compact list of labeled/actionable elements (text, resourceId, className, tap center `xy`, flags). Prefer over a screenshot for "what is on screen / is X visible / which button" and routing — cheaper and more reliable for text; screenshot only for visual layout the tree cannot convey. Returns one page of nodes plus `total`, `nodeCount`, and `hasMore`. When `hasMore` is true, narrow with `contains`/`resourceId` first; if you genuinely need the rest, call again with `offset` set to the returned `nextOffset`. Each call is a fresh live read — after any tap/type/scroll the layout may change, so restart paging from `offset: 0`.',
            inputSchema: {
                deviceId: z.string(),
                contains: z
                    .string()
                    .optional()
                    .describe('Case-insensitive substring filter across text, contentDescription, and resourceId.'),
                resourceId: z
                    .string()
                    .optional()
                    .describe('Keep only nodes whose resourceId matches (full id or its short post-slash form).'),
                includeAll: z
                    .boolean()
                    .optional()
                    .describe(
                        'Include layout containers too, not just actionable/labeled nodes. Still capped + redacted.',
                    ),
                offset: z
                    .number()
                    .int()
                    .min(0)
                    .optional()
                    .describe(
                        '0-based start into the kept-node list, for paging. Pass the `nextOffset` from a prior `hasMore` result.',
                    ),
            },
        },
        async ({ deviceId, contains, resourceId, includeAll, offset }) => {
            const raw = (await ctx.backend.devices.getDeviceUiState(deviceId)) as RawUiStateResponse;
            const filter: UiStateFilter = { contains, resourceId, includeAll };
            return asTextResult(compactUiState(deviceId, raw, filter, offset));
        },
    );

    server.registerTool(
        'list_apps_on_device',
        {
            description:
                'List apps installed on a device (package_name, label, version_name, version_code, is_system_app). Excludes OEM/system bundles by default.',
            inputSchema: {
                deviceId: z.string(),
                includeSystemApps: z.boolean().optional(),
                includeProtectedApps: z.boolean().optional(),
            },
        },
        async ({ deviceId, includeSystemApps, includeProtectedApps }) =>
            asTextResult(
                await ctx.backend.devices.listAppsOnDevice(deviceId, {
                    ...ifDefined('includeSystemApps', includeSystemApps),
                    ...ifDefined('includeProtectedApps', includeProtectedApps),
                }),
            ),
    );

    server.registerTool(
        'create_device',
        {
            description:
                'Provision a new device. The API bills it to your account and returns an error if your credits are insufficient. Provisioning takes a while: after creating, poll get_device with the returned id until state is "ready" before using it.',
            inputSchema: {
                clientRequestId: z.string().min(1).max(128).optional().describe('Reuse to retry safely; use a new value to deliberately repeat the purchase.'),
                deviceType: z.enum(DEVICE_TYPES).optional(),
                name: z.string().max(64).optional(),
                country: z
                    .string()
                    .regex(/^[A-Za-z]{2}$/)
                    .optional()
                    .describe('ISO 3166-1 alpha-2 country code.'),
            },
        },
        async (opts) => asTextResult(await ctx.backend.devices.createDevice(opts)),
    );

    server.registerTool(
        'terminate_device',
        {
            description: 'Terminate a device. Irreversible — confirm with the user before calling.',
            inputSchema: { deviceId: z.string() },
        },
        async ({ deviceId }) => asTextResult(await ctx.backend.devices.terminateDevice(deviceId)),
    );
}
