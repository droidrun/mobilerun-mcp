import { manageDeviceRecordingsTrajectorySchema } from '../backend/device-control.js';
import { manageDeviceRecordingsVideoSchema } from '../backend/device-control.js';
import { manageDeviceScreenshotsImageSchema } from '../backend/device-control.js';
import {
    manageEsimSetRoamingSchema,
    manageEsimStatusSchema,
    manageEsimApnListSchema,
    manageEsimApnSelectSchema,
    manageEsimApnSetSchema,
} from '../backend/device-control.js';
import {
    configureDeviceResetLocationSchema,
    configureDeviceKioskEnableSchema,
    configureDeviceKioskDisableSchema,
    configureDeviceUpdateProfileSchema,
} from '../backend/device-control.js';
import {
    manageDeviceAppsGrantPermissionSchema,
    manageDeviceAppsRevokePermissionSchema,
    manageDeviceAppsListInstallsSchema,
} from '../backend/device-control.js';
import {
    deviceActionClipboardGetSchema,
    deviceActionClipboardSetSchema,
    deviceActionDeepLinkSchema,
    deviceActionBrowserScriptSchema,
} from '../backend/device-control.js';
import {
    manageDeviceStopSchema,
    manageDeviceResumeSchema,
    manageDeviceSummarySchema,
    manageDeviceRetrieveCapabilitiesSchema,
    manageDeviceRecordingsListSchema,
    manageDeviceRecordingsDeleteSchema,
    manageDeviceRecordingsScreenshotsSchema,
    manageDeviceRecordingsStartSchema,
    manageDeviceRecordingsStatusSchema,
    manageDeviceRecordingsStopSchema,
    manageDeviceScreenshotsListSchema,
    manageDeviceScreenshotsDeleteSchema,
    manageDeviceScreenshotsCaptureSchema,
    manageDeviceTrafficSessionsCreateSchema,
    manageDeviceTrafficSessionsRetrieveSchema,
    manageDeviceTrafficSessionsListSchema,
    manageDeviceTrafficSessionsDeleteSchema,
    manageDeviceMediaSessionsCreateSchema,
    manageDeviceMediaSessionsDeleteSchema,
    manageDeviceMediaSessionsActivateSchema,
    manageDeviceMediaSessionsRetrieveCurrentSchema,
} from '../backend/device-control.js';
// Device-control bundle tools, including device media and connectivity operations.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asErrorResult, asTextResult, ifDefined } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

function requireValue<T>(value: T | undefined, name: string, operation: string): T {
    if (value === undefined) throw new Error(`operation=${operation} requires ${name}`);
    return value;
}

/** Rejects any input key not on `allowed` for the chosen operation — fail-closed field allowlist, mirrors tools/workflows.ts's ALLOWED_FILTERS pattern. */
function disallowedFieldError(
    operation: string,
    allowed: readonly string[],
    allKeys: readonly string[],
    input: Record<string, unknown>,
): string | null {
    const extra = allKeys.filter((k) => input[k] !== undefined && !allowed.includes(k));
    if (extra.length === 0) return null;
    return `field ${extra.join(', ')} is not valid for operation=${operation}; allowed fields: ${allowed.join(', ') || '(none)'}`;
}

// Inline base64 payload cap for manage_device_files upload/download — the
// SDK has no presigned-URL alternative for device files (unlike this
// package's general principle of preferring short-lived URLs over base64
// in MCP JSON for binary responses: there is nothing to redirect to here),
// so this tool caps the raw payload instead. 256KB decoded, i.e. ~341,334
// base64 characters (4/3 expansion).
const MAX_INLINE_FILE_BYTES = 256 * 1024;
const MAX_INLINE_BASE64_CHARS = Math.ceil((MAX_INLINE_FILE_BYTES * 4) / 3);

// ---------------------------------------------------------------------------
// manage_device
// ---------------------------------------------------------------------------

const MANAGE_DEVICE_OPERATIONS = [
    'recordings_trajectory',
    'recordings_video',
    'screenshots_image',
    'reboot',
    'reset',
    'rename',
    'wait_ready',
    'get_capabilities',
    'count',
    'stop',
    'resume',
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
] as const;
type ManageDeviceOperation = (typeof MANAGE_DEVICE_OPERATIONS)[number];
const MANAGE_DEVICE_FIELDS: Record<ManageDeviceOperation, readonly string[]> = {
    recordings_trajectory: ['params'],
    recordings_video: ['params'],
    screenshots_image: ['params'],
    stop: ['params'],
    resume: ['params'],
    summary: ['params'],
    retrieve_capabilities: ['params'],
    recordings_list: ['params'],
    recordings_delete: ['params'],
    recordings_screenshots: ['params'],
    recordings_start: ['params'],
    recordings_status: ['params'],
    recordings_stop: ['params'],
    screenshots_list: ['params'],
    screenshots_delete: ['params'],
    screenshots_capture: ['params'],
    traffic_sessions_create: ['params'],
    traffic_sessions_retrieve: ['params'],
    traffic_sessions_list: ['params'],
    traffic_sessions_delete: ['params'],
    media_sessions_create: ['params'],
    media_sessions_delete: ['params'],
    media_sessions_activate: ['params'],
    media_sessions_retrieve_current: ['params'],

    reboot: [],
    reset: [],
    rename: ['name'],
    wait_ready: [],
    get_capabilities: [],
    count: [],
};
const MANAGE_DEVICE_FIELD_KEYS = ['name'] as const;

function registerManageDevice(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_DEVICE_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device'));
    server.registerTool(
        'manage_device',
        {
            description:
                'Device lifecycle operations. Operations: reboot, reset (factory-reset to a fresh state — destructive), rename (needs name), wait_ready (blocks until state=ready), get_capabilities (device profile: carrier, display, identifiers, model), count (claimed-device counts by state — no deviceId).' +
                ' Additional operations (use params): stop: Stop a device. resume: Resume a stopped device; billing may resume. summary: Read device counts and usage summary. retrieve_capabilities: Read supported device features. recordings_list: Manage device recordings: list. recordings_delete: Manage device recordings: delete. recordings_screenshots: Manage device recordings: screenshots. recordings_start: Manage device recordings: start. recordings_status: Manage device recordings: status. recordings_stop: Manage device recordings: stop. screenshots_list: Manage device screenshots: list. screenshots_delete: Manage device screenshots: delete. screenshots_capture: Capture a PNG as inline base64 (up to 2 MB); save optionally stores device media. traffic_sessions_create: Manage device traffic sessions: create. traffic_sessions_retrieve: Manage device traffic sessions: retrieve. traffic_sessions_list: Manage device traffic sessions: list. traffic_sessions_delete: Manage device traffic sessions: delete. media_sessions_create: Manage device media sessions: create. media_sessions_delete: Manage device media sessions: delete. media_sessions_activate: Manage device media sessions: activate. media_sessions_retrieve_current: Manage device media sessions: retrieve current.' +
                ' screenshots_image: Read a short-lived signed download URL.' +
                ' recordings_video: Read a short-lived signed download URL.' +
                ' recordings_trajectory: Read a short-lived signed download URL.' +
                allowedValuesNote(values, MANAGE_DEVICE_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_DEVICE_OPERATIONS),
                params: z
                    .union([
                        manageDeviceRecordingsTrajectorySchema,
                        manageDeviceRecordingsVideoSchema,
                        manageDeviceScreenshotsImageSchema,
                        manageDeviceStopSchema,
                        manageDeviceResumeSchema,
                        manageDeviceSummarySchema,
                        manageDeviceRetrieveCapabilitiesSchema,
                        manageDeviceRecordingsListSchema,
                        manageDeviceRecordingsDeleteSchema,
                        manageDeviceRecordingsScreenshotsSchema,
                        manageDeviceRecordingsStartSchema,
                        manageDeviceRecordingsStatusSchema,
                        manageDeviceRecordingsStopSchema,
                        manageDeviceScreenshotsListSchema,
                        manageDeviceScreenshotsDeleteSchema,
                        manageDeviceScreenshotsCaptureSchema,
                        manageDeviceTrafficSessionsCreateSchema,
                        manageDeviceTrafficSessionsRetrieveSchema,
                        manageDeviceTrafficSessionsListSchema,
                        manageDeviceTrafficSessionsDeleteSchema,
                        manageDeviceMediaSessionsCreateSchema,
                        manageDeviceMediaSessionsDeleteSchema,
                        manageDeviceMediaSessionsActivateSchema,
                        manageDeviceMediaSessionsRetrieveCurrentSchema,
                    ])
                    .optional()
                    .describe('Parameters for additional operations; the matching object shape is required.'),
                deviceId: z.string().optional().describe('Required for every operation except count and summary.'),
                name: z.string().max(64).optional(),
            },
        },
        async (input: { operation: ManageDeviceOperation; deviceId?: string; name?: string; params?: unknown }) => {
            if (input.operation === 'recordings_trajectory')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsTrajectory(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsTrajectorySchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'recordings_video')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsVideo(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsVideoSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'screenshots_image')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceScreenshotsImage(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceScreenshotsImageSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'stop')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceStop(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceStopSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'resume')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceResume(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceResumeSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'summary')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceSummary(
                        input.deviceId ?? '',
                        manageDeviceSummarySchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'retrieve_capabilities')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRetrieveCapabilities(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRetrieveCapabilitiesSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'recordings_list')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsList(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsListSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'recordings_delete')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsDelete(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsDeleteSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'recordings_screenshots')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsScreenshots(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsScreenshotsSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'recordings_start')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsStart(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsStartSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'recordings_status')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsStatus(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsStatusSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'recordings_stop')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsStop(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsStopSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'screenshots_list')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceScreenshotsList(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceScreenshotsListSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'screenshots_delete')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceScreenshotsDelete(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceScreenshotsDeleteSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'screenshots_capture')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceScreenshotsCapture(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceScreenshotsCaptureSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'traffic_sessions_create')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceTrafficSessionsCreate(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceTrafficSessionsCreateSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'traffic_sessions_retrieve')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceTrafficSessionsRetrieve(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceTrafficSessionsRetrieveSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'traffic_sessions_list')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceTrafficSessionsList(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceTrafficSessionsListSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'traffic_sessions_delete')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceTrafficSessionsDelete(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceTrafficSessionsDeleteSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'media_sessions_create')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceMediaSessionsCreate(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceMediaSessionsCreateSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'media_sessions_delete')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceMediaSessionsDelete(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceMediaSessionsDeleteSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'media_sessions_activate')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceMediaSessionsActivate(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceMediaSessionsActivateSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'media_sessions_retrieve_current')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceMediaSessionsRetrieveCurrent(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceMediaSessionsRetrieveCurrentSchema.parse(input.params ?? {}),
                    ),
                );

            const { operation } = input;
            const fieldError = disallowedFieldError(
                operation,
                MANAGE_DEVICE_FIELDS[operation],
                MANAGE_DEVICE_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.deviceControl;
            const devices = ctx.backend.devices;

            if (operation === 'count') return asTextResult(await backend.countDevices());

            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            if (operation === 'reboot') {
                await backend.rebootDevice(deviceId);
                return asTextResult({ status: 'reboot_requested', deviceId });
            }
            if (operation === 'reset') {
                await backend.resetDevice(deviceId);
                return asTextResult({ status: 'reset_requested', deviceId });
            }
            if (operation === 'rename') {
                const name = requireValue(input.name, 'name', operation);
                await backend.renameDevice(deviceId, name);
                return asTextResult(await devices.getDevice(deviceId));
            }
            if (operation === 'wait_ready') {
                await backend.waitDeviceReady(deviceId);
                return asTextResult(await devices.getDevice(deviceId));
            }
            return asTextResult(await backend.getDeviceCapabilities(deviceId));
        },
    );
}

// ---------------------------------------------------------------------------
// device_action
// ---------------------------------------------------------------------------

const DEVICE_ACTION_OPERATIONS = [
    'tap',
    'swipe',
    'keyboard_write',
    'keyboard_key',
    'keyboard_clear',
    'global_action',
    'clipboard_get',
    'clipboard_set',
    'deep_link',
    'browser_script',
] as const;
type DeviceActionOperation = (typeof DEVICE_ACTION_OPERATIONS)[number];
const DEVICE_ACTION_FIELDS: Record<DeviceActionOperation, readonly string[]> = {
    clipboard_get: ['params'],
    clipboard_set: ['params'],
    deep_link: ['params'],
    browser_script: ['params'],

    tap: ['x', 'y', 'pacedInput'],
    swipe: ['startX', 'startY', 'endX', 'endY', 'duration', 'pacedInput'],
    keyboard_write: ['text', 'clear', 'errorRate', 'pacedInput', 'wpm'],
    keyboard_key: ['key'],
    keyboard_clear: [],
    global_action: ['action'],
};
const DEVICE_ACTION_FIELD_KEYS = [
    'x',
    'y',
    'startX',
    'startY',
    'endX',
    'endY',
    'duration',
    'pacedInput',
    'text',
    'clear',
    'errorRate',
    'wpm',
    'key',
    'action',
] as const;

function registerDeviceAction(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(DEVICE_ACTION_OPERATIONS, ctx.policy.operationAllowlist?.get('device_action'));
    server.registerTool(
        'device_action',
        {
            description:
                'Low-level device input. Operations: tap (x, y), swipe (startX, startY, endX, endY, duration ms), keyboard_write (text, clear?, errorRate?, wpm?, pacedInput?), keyboard_key (key: Android keycode), keyboard_clear, global_action (action: Android global-action code, e.g. back/home/recents). `pacedInput` (tap/swipe/keyboard_write) sends input with variable timing and gesture paths instead of instant events, where supported. Per-call `displayId` targets a specific display on multi-display devices.' +
                ' Additional operations (use params): clipboard_get: Read clipboard text. clipboard_set: Write clipboard text. deep_link: Open a URL or app link. browser_script: Run a script in the device browser.' +
                allowedValuesNote(values, DEVICE_ACTION_OPERATIONS),
            inputSchema: {
                operation: z.enum(DEVICE_ACTION_OPERATIONS),
                params: z
                    .union([
                        deviceActionClipboardGetSchema,
                        deviceActionClipboardSetSchema,
                        deviceActionDeepLinkSchema,
                        deviceActionBrowserScriptSchema,
                    ])
                    .optional()
                    .describe('Parameters for additional operations; the matching object shape is required.'),
                deviceId: z.string(),
                displayId: z.number().int().optional(),
                x: z.number().optional(),
                y: z.number().optional(),
                startX: z.number().optional(),
                startY: z.number().optional(),
                endX: z.number().optional(),
                endY: z.number().optional(),
                duration: z.number().int().positive().optional().describe('Swipe duration in milliseconds.'),
                pacedInput: z
                    .boolean()
                    .optional()
                    .describe('tap/swipe/keyboard_write: send input with variable timing and gesture paths.'),
                text: z.string().optional(),
                clear: z.boolean().optional().describe('keyboard_write: clear existing input before typing.'),
                errorRate: z
                    .number()
                    .optional()
                    .describe(
                        'keyboard_write with pacedInput: correction rate per character (backspace and retype). -1 uses the default.',
                    ),
                wpm: z
                    .number()
                    .optional()
                    .describe('keyboard_write with pacedInput: typing speed in words per minute. 0 uses the default.'),
                key: z.number().int().optional().describe('keyboard_key: Android keycode.'),
                action: z.number().int().optional().describe('global_action: Android global-action code.'),
            },
        },
        async (
            input: { operation: DeviceActionOperation; deviceId: string; displayId?: number } & Record<string, unknown>,
        ) => {
            if (input.operation === 'clipboard_get')
                return asTextResult(
                    await ctx.backend.deviceControl.deviceActionClipboardGet(
                        input.deviceId,
                        deviceActionClipboardGetSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'clipboard_set')
                return asTextResult(
                    await ctx.backend.deviceControl.deviceActionClipboardSet(
                        input.deviceId,
                        deviceActionClipboardSetSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'deep_link')
                return asTextResult(
                    await ctx.backend.deviceControl.deviceActionDeepLink(
                        input.deviceId,
                        deviceActionDeepLinkSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'browser_script')
                return asTextResult(
                    await ctx.backend.deviceControl.deviceActionBrowserScript(
                        input.deviceId,
                        deviceActionBrowserScriptSchema.parse(input.params ?? {}),
                    ),
                );

            const { operation, deviceId, displayId } = input;
            const fieldError = disallowedFieldError(
                operation,
                DEVICE_ACTION_FIELDS[operation],
                DEVICE_ACTION_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.deviceControl;
            // The API names this parameter `stealth`.
            const stealth = input.pacedInput as boolean | undefined;

            if (operation === 'tap') {
                await backend.tap({
                    deviceId,
                    displayId,
                    stealth,
                    x: requireValue(input.x as number | undefined, 'x', operation),
                    y: requireValue(input.y as number | undefined, 'y', operation),
                });
            } else if (operation === 'swipe') {
                await backend.swipe({
                    deviceId,
                    displayId,
                    stealth,
                    startX: requireValue(input.startX as number | undefined, 'startX', operation),
                    startY: requireValue(input.startY as number | undefined, 'startY', operation),
                    endX: requireValue(input.endX as number | undefined, 'endX', operation),
                    endY: requireValue(input.endY as number | undefined, 'endY', operation),
                    duration: requireValue(input.duration as number | undefined, 'duration', operation),
                });
            } else if (operation === 'keyboard_write') {
                await backend.keyboardWrite({
                    deviceId,
                    displayId,
                    stealth,
                    text: requireValue(input.text as string | undefined, 'text', operation),
                    clear: input.clear as boolean | undefined,
                    errorRate: input.errorRate as number | undefined,
                    wpm: input.wpm as number | undefined,
                });
            } else if (operation === 'keyboard_key') {
                await backend.keyboardKey({
                    deviceId,
                    displayId,
                    key: requireValue(input.key as number | undefined, 'key', operation),
                });
            } else if (operation === 'keyboard_clear') {
                await backend.keyboardClear(deviceId, displayId);
            } else {
                await backend.globalAction({
                    deviceId,
                    displayId,
                    action: requireValue(input.action as number | undefined, 'action', operation),
                });
            }
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    );
}

// ---------------------------------------------------------------------------
// manage_device_apps
// ---------------------------------------------------------------------------

const MANAGE_APPS_OPERATIONS = [
    'install',
    'delete',
    'start',
    'stop',
    'list_packages',
    'grant_permission',
    'revoke_permission',
    'list_installs',
] as const;
type ManageAppsOperation = (typeof MANAGE_APPS_OPERATIONS)[number];
const MANAGE_APPS_FIELDS: Record<ManageAppsOperation, readonly string[]> = {
    grant_permission: ['params'],
    revoke_permission: ['params'],
    list_installs: ['params'],

    install: ['packageName', 'bundleId'],
    delete: ['packageName'],
    start: ['packageName', 'activity'],
    stop: ['packageName'],
    list_packages: ['includeSystemPackages', 'includeProtectedPackages'],
};
const MANAGE_APPS_FIELD_KEYS = [
    'packageName',
    'bundleId',
    'activity',
    'includeSystemPackages',
    'includeProtectedPackages',
] as const;

function registerManageDeviceApps(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_APPS_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device_apps'));
    server.registerTool(
        'manage_device_apps',
        {
            description:
                'Mutate apps on a device. Operations: install (packageName and/or bundleId — at least one), delete (packageName), start (packageName, activity?), stop (packageName), list_packages (raw installed package names, includeSystemPackages?, includeProtectedPackages?). Read app metadata (label, versions) via list_apps_on_device instead.' +
                ' Additional operations (use params): grant_permission: Grant an app notification permission. revoke_permission: Revoke an app notification permission. list_installs: Read app installation jobs.' +
                allowedValuesNote(values, MANAGE_APPS_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_APPS_OPERATIONS),
                params: z
                    .union([
                        manageDeviceAppsGrantPermissionSchema,
                        manageDeviceAppsRevokePermissionSchema,
                        manageDeviceAppsListInstallsSchema,
                    ])
                    .optional()
                    .describe('Parameters for additional operations; the matching object shape is required.'),
                deviceId: z.string(),
                packageName: z.string().optional(),
                bundleId: z.string().optional().describe('iOS bundle identifier (install only).'),
                activity: z.string().optional().describe('start only: specific activity to launch.'),
                includeSystemPackages: z.boolean().optional(),
                includeProtectedPackages: z.boolean().optional(),
            },
        },
        async (input: { operation: ManageAppsOperation; deviceId: string } & Record<string, unknown>) => {
            if (input.operation === 'grant_permission')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceAppsGrantPermission(
                        input.deviceId,
                        manageDeviceAppsGrantPermissionSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'revoke_permission')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceAppsRevokePermission(
                        input.deviceId,
                        manageDeviceAppsRevokePermissionSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'list_installs')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceAppsListInstalls(
                        input.deviceId,
                        manageDeviceAppsListInstallsSchema.parse(input.params ?? {}),
                    ),
                );

            const { operation, deviceId } = input;
            const fieldError = disallowedFieldError(
                operation,
                MANAGE_APPS_FIELDS[operation],
                MANAGE_APPS_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const bundleId = input.bundleId as string | undefined;

            if (operation === 'install') {
                if (!packageName && !bundleId)
                    throw new Error('operation=install requires packageName and/or bundleId');
                await backend.installApp(deviceId, { packageName, bundleId });
                return asTextResult({ status: 'install_requested', deviceId, packageName, bundleId });
            }
            if (operation === 'list_packages') {
                return asTextResult(
                    await backend.listPackages(deviceId, {
                        ...ifDefined('includeSystemPackages', input.includeSystemPackages as boolean | undefined),
                        ...ifDefined('includeProtectedPackages', input.includeProtectedPackages as boolean | undefined),
                    }),
                );
            }
            const pkg = requireValue(packageName, 'packageName', operation);
            if (operation === 'delete') {
                await backend.deleteApp(deviceId, pkg);
            } else if (operation === 'start') {
                await backend.startApp(deviceId, pkg, { activity: input.activity as string | undefined });
            } else {
                await backend.stopApp(deviceId, pkg);
            }
            return asTextResult({ status: 'ok', operation, deviceId, packageName: pkg });
        },
    );
}

// ---------------------------------------------------------------------------
// manage_device_files
// ---------------------------------------------------------------------------

const MANAGE_FILES_OPERATIONS = ['list', 'upload', 'download', 'delete'] as const;
type ManageFilesOperation = (typeof MANAGE_FILES_OPERATIONS)[number];
const MANAGE_FILES_FIELDS: Record<ManageFilesOperation, readonly string[]> = {
    list: [],
    upload: ['contentBase64', 'fileName', 'contentType'],
    download: [],
    delete: [],
};
const MANAGE_FILES_FIELD_KEYS = ['contentBase64', 'fileName', 'contentType'] as const;

function registerManageDeviceFiles(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_FILES_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device_files'));
    server.registerTool(
        'manage_device_files',
        {
            description:
                `Device filesystem access. Operations: list (directory entries at \`path\`), upload (write \`contentBase64\` to \`path\`; decoded payload capped at ${MAX_INLINE_FILE_BYTES / 1024}KB — larger files are rejected), download (read \`path\`; oversized results are rejected the same way), delete (\`path\`). \`path\` is required for every operation.` +
                allowedValuesNote(values, MANAGE_FILES_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_FILES_OPERATIONS),
                deviceId: z.string(),
                path: z.string().min(1),
                contentBase64: z.string().max(MAX_INLINE_BASE64_CHARS).optional(),
                fileName: z.string().optional(),
                contentType: z.string().optional(),
            },
        },
        async (
            input: { operation: ManageFilesOperation; deviceId: string; path: string } & Record<string, unknown>,
        ) => {
            const { operation, deviceId, path } = input;
            const fieldError = disallowedFieldError(
                operation,
                MANAGE_FILES_FIELDS[operation],
                MANAGE_FILES_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.deviceControl;
            if (operation === 'list') return asTextResult(await backend.listFiles(deviceId, { path }));
            if (operation === 'upload') {
                const contentBase64 = requireValue(
                    input.contentBase64 as string | undefined,
                    'contentBase64',
                    operation,
                );
                if (contentBase64.length > MAX_INLINE_BASE64_CHARS) {
                    return asErrorResult(
                        `upload payload exceeds the ${MAX_INLINE_FILE_BYTES / 1024}KB inline limit — use a smaller file.`,
                    );
                }
                await backend.uploadFile(deviceId, {
                    path,
                    contentBase64,
                    fileName: input.fileName as string | undefined,
                    contentType: input.contentType as string | undefined,
                });
                return asTextResult({ status: 'uploaded', deviceId, path });
            }
            if (operation === 'download') {
                const result = await backend.downloadFile(deviceId, path);
                if (result.content.length > MAX_INLINE_BASE64_CHARS) {
                    return asErrorResult(
                        `device file at "${path}" exceeds the ${MAX_INLINE_FILE_BYTES / 1024}KB inline transfer limit.`,
                    );
                }
                return asTextResult(result);
            }
            await backend.deleteFile(deviceId, path);
            return asTextResult({ status: 'deleted', deviceId, path });
        },
    );
}

// ---------------------------------------------------------------------------
// configure_device
// ---------------------------------------------------------------------------

const CONFIGURE_DEVICE_OPERATIONS = [
    'get_language',
    'set_language',
    'get_timezone',
    'set_timezone',
    'get_location',
    'set_location',
    'get_time',
    'get_overlay',
    'set_overlay',
    'proxy_connect',
    'proxy_disconnect',
    'get_proxy_status',
    'reset_location',
    'kiosk_enable',
    'kiosk_disable',
    'update_profile',
] as const;
type ConfigureDeviceOperation = (typeof CONFIGURE_DEVICE_OPERATIONS)[number];
const CONFIGURE_DEVICE_FIELDS: Record<ConfigureDeviceOperation, readonly string[]> = {
    reset_location: ['params'],
    kiosk_enable: ['params'],
    kiosk_disable: ['params'],
    update_profile: ['params'],

    get_language: [],
    set_language: ['locale', 'restart'],
    get_timezone: [],
    set_timezone: ['timezone'],
    get_location: [],
    set_location: ['latitude', 'longitude'],
    get_time: [],
    get_overlay: [],
    set_overlay: ['visible'],
    proxy_connect: ['proxyName', 'smartIp', 'socks5Host', 'socks5Port', 'socks5User', 'socks5Password'],
    proxy_disconnect: [],
    get_proxy_status: [],
};
const CONFIGURE_DEVICE_FIELD_KEYS = [
    'locale',
    'restart',
    'timezone',
    'latitude',
    'longitude',
    'visible',
    'proxyName',
    'smartIp',
    'socks5Host',
    'socks5Port',
    'socks5User',
    'socks5Password',
] as const;

function registerConfigureDevice(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(CONFIGURE_DEVICE_OPERATIONS, ctx.policy.operationAllowlist?.get('configure_device'));
    server.registerTool(
        'configure_device',
        {
            description:
                'Read/write device settings. Operations: get_language/set_language (locale: BCP-47 e.g. en-US; restart? forces the change to apply immediately instead of on next reboot), get_timezone/set_timezone (IANA tz), get_location/set_location (latitude, longitude), get_time (read-only device clock), get_overlay/set_overlay (visible: the on-device debug/annotation overlay), proxy_connect (proxyName? and/or smartIp?, or socks5Host+socks5Port+socks5User?+socks5Password? for a SOCKS5 proxy; smartIp defaults to true — aligns the device location, time zone, locale, and carrier settings with the proxy region; pass false to connect without changing device settings), proxy_disconnect, get_proxy_status.' +
                ' Additional operations (use params): reset_location: Reset the device location. kiosk_enable: Enable kiosk mode for an app. kiosk_disable: Disable kiosk mode. update_profile: Update device profile settings.' +
                allowedValuesNote(values, CONFIGURE_DEVICE_OPERATIONS),
            inputSchema: {
                operation: z.enum(CONFIGURE_DEVICE_OPERATIONS),
                params: z
                    .union([
                        configureDeviceResetLocationSchema,
                        configureDeviceKioskEnableSchema,
                        configureDeviceKioskDisableSchema,
                        configureDeviceUpdateProfileSchema,
                    ])
                    .optional()
                    .describe('Parameters for additional operations; the matching object shape is required.'),
                deviceId: z.string(),
                locale: z.string().optional(),
                restart: z.boolean().optional(),
                timezone: z.string().optional(),
                latitude: z.number().optional(),
                longitude: z.number().optional(),
                visible: z.boolean().optional(),
                proxyName: z.string().optional(),
                smartIp: z.boolean().optional(),
                socks5Host: z.string().optional(),
                socks5Port: z.number().int().optional(),
                socks5User: z.string().optional(),
                socks5Password: z.string().optional(),
            },
        },
        async (input: { operation: ConfigureDeviceOperation; deviceId: string } & Record<string, unknown>) => {
            if (input.operation === 'reset_location')
                return asTextResult(
                    await ctx.backend.deviceControl.configureDeviceResetLocation(
                        input.deviceId,
                        configureDeviceResetLocationSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'kiosk_enable')
                return asTextResult(
                    await ctx.backend.deviceControl.configureDeviceKioskEnable(
                        input.deviceId,
                        configureDeviceKioskEnableSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'kiosk_disable')
                return asTextResult(
                    await ctx.backend.deviceControl.configureDeviceKioskDisable(
                        input.deviceId,
                        configureDeviceKioskDisableSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'update_profile')
                return asTextResult(
                    await ctx.backend.deviceControl.configureDeviceUpdateProfile(
                        input.deviceId,
                        configureDeviceUpdateProfileSchema.parse(input.params ?? {}),
                    ),
                );

            const { operation, deviceId } = input;
            const fieldError = disallowedFieldError(
                operation,
                CONFIGURE_DEVICE_FIELDS[operation],
                CONFIGURE_DEVICE_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.deviceControl;
            switch (operation) {
                case 'get_language':
                    return asTextResult(await backend.getLanguage(deviceId));
                case 'set_language':
                    await backend.setLanguage(deviceId, {
                        locale: requireValue(input.locale as string | undefined, 'locale', operation),
                        restart: input.restart as boolean | undefined,
                    });
                    return asTextResult({ status: 'ok', operation, deviceId });
                case 'get_timezone':
                    return asTextResult(await backend.getTimezone(deviceId));
                case 'set_timezone':
                    await backend.setTimezone(
                        deviceId,
                        requireValue(input.timezone as string | undefined, 'timezone', operation),
                    );
                    return asTextResult({ status: 'ok', operation, deviceId });
                case 'get_location':
                    return asTextResult(await backend.getLocation(deviceId));
                case 'set_location':
                    await backend.setLocation(deviceId, {
                        latitude: requireValue(input.latitude as number | undefined, 'latitude', operation),
                        longitude: requireValue(input.longitude as number | undefined, 'longitude', operation),
                    });
                    return asTextResult({ status: 'ok', operation, deviceId });
                case 'get_time':
                    return asTextResult(await backend.getTime(deviceId));
                case 'get_overlay':
                    return asTextResult(await backend.getOverlay(deviceId));
                case 'set_overlay':
                    await backend.setOverlay(
                        deviceId,
                        requireValue(input.visible as boolean | undefined, 'visible', operation),
                    );
                    return asTextResult({ status: 'ok', operation, deviceId });
                case 'proxy_connect': {
                    const socks5Host = input.socks5Host as string | undefined;
                    const socks5Port = input.socks5Port as number | undefined;
                    await backend.connectProxy(deviceId, {
                        name: input.proxyName as string | undefined,
                        // Default smart-IP on: align device location, time zone, locale, and carrier with the proxy region unless the caller explicitly opts out.
                        smartIp: (input.smartIp as boolean | undefined) ?? true,
                        socks5:
                            socks5Host && socks5Port !== undefined
                                ? {
                                      host: socks5Host,
                                      port: socks5Port,
                                      user: input.socks5User as string | undefined,
                                      password: input.socks5Password as string | undefined,
                                  }
                                : undefined,
                    });
                    return asTextResult({ status: 'ok', operation, deviceId });
                }
                case 'proxy_disconnect':
                    await backend.disconnectProxy(deviceId);
                    return asTextResult({ status: 'ok', operation, deviceId });
                case 'get_proxy_status':
                    return asTextResult(await backend.getProxyStatus(deviceId));
            }
        },
    );
}

// ---------------------------------------------------------------------------
// manage_esim
// ---------------------------------------------------------------------------

const MANAGE_ESIM_OPERATIONS = [
    'list',
    'activate',
    'enable',
    'remove',
    'set_roaming',
    'status',
    'apn_list',
    'apn_select',
    'apn_set',
] as const;
type ManageEsimOperation = (typeof MANAGE_ESIM_OPERATIONS)[number];
const MANAGE_ESIM_FIELDS: Record<ManageEsimOperation, readonly string[]> = {
    set_roaming: ['params'],
    status: ['params'],
    apn_list: ['params'],
    apn_select: ['params'],
    apn_set: ['params'],

    list: [],
    activate: ['enable', 'smDpAddr', 'confirmationCode', 'matchingId'],
    enable: ['subId'],
    remove: ['subId'],
};
const MANAGE_ESIM_FIELD_KEYS = ['enable', 'smDpAddr', 'confirmationCode', 'matchingId', 'subId'] as const;

function registerManageEsim(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_ESIM_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_esim'));
    server.registerTool(
        'manage_esim',
        {
            description:
                'eSIM subscription management. Operations: list, activate (smDpAddr required, enable: whether to also enable the downloaded profile, confirmationCode?/matchingId? — confirmationCode requires matchingId, only needed when the SM-DP+ challenges for it), enable (subId), remove (subId).' +
                ' Additional operations (use params): set_roaming: Enable or disable eSIM roaming. status: Read eSIM connectivity status. apn_list: List available access point settings. apn_select: Select an access point. apn_set: Set access point settings.' +
                allowedValuesNote(values, MANAGE_ESIM_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_ESIM_OPERATIONS),
                params: z
                    .union([
                        manageEsimSetRoamingSchema,
                        manageEsimStatusSchema,
                        manageEsimApnListSchema,
                        manageEsimApnSelectSchema,
                        manageEsimApnSetSchema,
                    ])
                    .optional()
                    .describe('Parameters for additional operations; the matching object shape is required.'),
                deviceId: z.string(),
                enable: z.boolean().optional(),
                smDpAddr: z.string().optional(),
                confirmationCode: z.string().optional(),
                matchingId: z.string().optional(),
                subId: z.number().int().optional(),
            },
        },
        async (input: { operation: ManageEsimOperation; deviceId: string } & Record<string, unknown>) => {
            if (input.operation === 'set_roaming')
                return asTextResult(
                    await ctx.backend.deviceControl.manageEsimSetRoaming(
                        input.deviceId,
                        manageEsimSetRoamingSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'status')
                return asTextResult(
                    await ctx.backend.deviceControl.manageEsimStatus(
                        input.deviceId,
                        manageEsimStatusSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'apn_list')
                return asTextResult(
                    await ctx.backend.deviceControl.manageEsimApnList(
                        input.deviceId,
                        manageEsimApnListSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'apn_select')
                return asTextResult(
                    await ctx.backend.deviceControl.manageEsimApnSelect(
                        input.deviceId,
                        manageEsimApnSelectSchema.parse(input.params ?? {}),
                    ),
                );
            if (input.operation === 'apn_set')
                return asTextResult(
                    await ctx.backend.deviceControl.manageEsimApnSet(
                        input.deviceId,
                        manageEsimApnSetSchema.parse(input.params ?? {}),
                    ),
                );

            const { operation, deviceId } = input;
            const fieldError = disallowedFieldError(
                operation,
                MANAGE_ESIM_FIELDS[operation],
                MANAGE_ESIM_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.deviceControl;
            if (operation === 'list') return asTextResult(await backend.listEsims(deviceId));
            if (operation === 'activate') {
                return asTextResult(
                    await backend.activateEsim(deviceId, {
                        enable: requireValue(input.enable as boolean | undefined, 'enable', operation),
                        smDpAddr: requireValue(input.smDpAddr as string | undefined, 'smDpAddr', operation),
                        confirmationCode: input.confirmationCode as string | undefined,
                        matchingId: input.matchingId as string | undefined,
                    }),
                );
            }
            const subId = requireValue(input.subId as number | undefined, 'subId', operation);
            if (operation === 'enable') {
                await backend.enableEsim(deviceId, subId);
            } else {
                await backend.removeEsim(deviceId, subId);
            }
            return asTextResult({ status: 'ok', operation, deviceId, subId });
        },
    );
}

export function registerDeviceControlTools(server: McpServer, ctx: ToolCtx): void {
    registerManageDevice(server, ctx);
    registerDeviceAction(server, ctx);
    registerManageDeviceApps(server, ctx);
    registerManageDeviceFiles(server, ctx);
    registerConfigureDevice(server, ctx);
    registerManageEsim(server, ctx);
}
