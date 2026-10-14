import { requireValue, disallowedFieldError } from './op-helpers.js';
// Device-control bundle tools, including device media and connectivity operations.

import {
    manageDeviceRecordingsTrajectorySchema,
    manageDeviceRecordingsVideoSchema,
    manageDeviceScreenshotsImageSchema,
    manageEsimSetRoamingSchema,
    manageEsimStatusSchema,
    manageEsimApnListSchema,
    manageEsimApnSelectSchema,
    manageEsimApnSetSchema,
    configureDeviceResetLocationSchema,
    configureDeviceKioskEnableSchema,
    configureDeviceKioskDisableSchema,
    configureDeviceUpdateProfileSchema,
    manageDeviceAppsGrantPermissionSchema,
    manageDeviceAppsRevokePermissionSchema,
    manageDeviceAppsListInstallsSchema,
    deviceActionClipboardGetSchema,
    deviceActionClipboardSetSchema,
    deviceActionDeepLinkSchema,
    deviceActionBrowserScriptSchema,
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
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ToolCtx } from '../ctx.js';
import { asErrorResult, asImageResult, asTextResult, ifDefined } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
import { MAX_INLINE_FILE_BYTES, MAX_INLINE_BASE64_CHARS } from '../inline-limits.js';

function redactTrafficStream(value: unknown, ctx: ToolCtx): unknown {
    const allowed = ctx.policy.operationAllowlist?.get('manage_device');
    if (!allowed || allowed.has('traffic_sessions_create')) return value;
    function redact(node: unknown): unknown {
        if (Array.isArray(node)) return node.map(redact);
        if (node && typeof node === 'object') {
            return Object.fromEntries(
                Object.entries(node).map(([key, entry]) => {
                    if (key === 'stream' && entry && typeof entry === 'object') {
                        const { token: _token, ...rest } = entry as Record<string, unknown>;
                        return [key, redact(rest)];
                    }
                    return [key, redact(entry)];
                }),
            );
        }
        return node;
    }
    return redact(value);
}



// Inline base64 payload cap for manage_device_files upload/download — the
// SDK has no presigned-URL alternative for device files (unlike this
// package's general principle of preferring short-lived URLs over base64
// in MCP JSON for binary responses: there is nothing to redirect to here),
// so this tool caps the raw payload instead. 256KB decoded, i.e. ~341,334
// base64 characters (4/3 expansion).

// ---------------------------------------------------------------------------
// manage_device
// ---------------------------------------------------------------------------

export const MANAGE_DEVICE_OPERATIONS = [
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
    recordings_trajectory: Object.keys(manageDeviceRecordingsTrajectorySchema.shape),
    recordings_video: Object.keys(manageDeviceRecordingsVideoSchema.shape),
    screenshots_image: Object.keys(manageDeviceScreenshotsImageSchema.shape),
    stop: Object.keys(manageDeviceStopSchema.shape),
    resume: Object.keys(manageDeviceResumeSchema.shape),
    summary: Object.keys(manageDeviceSummarySchema.shape),
    retrieve_capabilities: Object.keys(manageDeviceRetrieveCapabilitiesSchema.shape),
    recordings_list: Object.keys(manageDeviceRecordingsListSchema.shape),
    recordings_delete: Object.keys(manageDeviceRecordingsDeleteSchema.shape),
    recordings_screenshots: Object.keys(manageDeviceRecordingsScreenshotsSchema.shape),
    recordings_start: Object.keys(manageDeviceRecordingsStartSchema.shape),
    recordings_status: Object.keys(manageDeviceRecordingsStatusSchema.shape),
    recordings_stop: Object.keys(manageDeviceRecordingsStopSchema.shape),
    screenshots_list: Object.keys(manageDeviceScreenshotsListSchema.shape),
    screenshots_delete: Object.keys(manageDeviceScreenshotsDeleteSchema.shape),
    screenshots_capture: Object.keys(manageDeviceScreenshotsCaptureSchema.shape),
    traffic_sessions_create: Object.keys(manageDeviceTrafficSessionsCreateSchema.shape),
    traffic_sessions_retrieve: Object.keys(manageDeviceTrafficSessionsRetrieveSchema.shape),
    traffic_sessions_list: Object.keys(manageDeviceTrafficSessionsListSchema.shape),
    traffic_sessions_delete: Object.keys(manageDeviceTrafficSessionsDeleteSchema.shape),
    media_sessions_create: Object.keys(manageDeviceMediaSessionsCreateSchema.shape),
    media_sessions_delete: Object.keys(manageDeviceMediaSessionsDeleteSchema.shape),
    media_sessions_activate: Object.keys(manageDeviceMediaSessionsActivateSchema.shape),
    media_sessions_retrieve_current: Object.keys(manageDeviceMediaSessionsRetrieveCurrentSchema.shape),

    reboot: [],
    reset: [],
    rename: ['name'],
    wait_ready: [],
    get_capabilities: [],
    count: [],
};
for (const operation of MANAGE_DEVICE_OPERATIONS) {
    if (operation !== 'count' && operation !== 'summary') {
        MANAGE_DEVICE_FIELDS[operation] = [...MANAGE_DEVICE_FIELDS[operation], 'deviceId'];
    }
}
const MANAGE_DEVICE_FIELD_KEYS = [...new Set(Object.values(MANAGE_DEVICE_FIELDS).flat())];

function registerManageDevice(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_DEVICE_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device'));
    server.registerTool(
        'manage_device',
        {
            description:
                'Device lifecycle operations. Operations: reboot, reset (factory-reset to a fresh state — destructive), rename (needs name), wait_ready (blocks until state=ready), get_capabilities (device profile: carrier, display, identifiers, model), count (claimed-device counts by state — no deviceId).' +
                ' stop/resume affect device billing. summary reads account usage without deviceId. Recordings support list, start, stop, status, deletion and screenshot metadata. Screenshot capture returns a PNG image up to 256 KB; save stores device media. Traffic sessions capture network activity; media sessions control camera and microphone streams.' +
                ' screenshots_image, recordings_video and recordings_trajectory return short-lived signed download URLs.' +
                allowedValuesNote(values, MANAGE_DEVICE_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_DEVICE_OPERATIONS),
                ...manageDeviceRecordingsTrajectorySchema.partial().shape,
                ...manageDeviceRecordingsVideoSchema.partial().shape,
                ...manageDeviceScreenshotsImageSchema.partial().shape,
                ...manageDeviceSummarySchema.partial().shape,
                ...manageDeviceRecordingsListSchema.partial().shape,
                ...manageDeviceRecordingsDeleteSchema.partial().shape,
                ...manageDeviceRecordingsScreenshotsSchema.partial().shape,
                ...manageDeviceRecordingsStartSchema.partial().shape,
                ...manageDeviceRecordingsStatusSchema.partial().shape,
                ...manageDeviceRecordingsStopSchema.partial().shape,
                ...manageDeviceScreenshotsListSchema.partial().shape,
                ...manageDeviceScreenshotsDeleteSchema.partial().shape,
                ...manageDeviceScreenshotsCaptureSchema.partial().shape,
                ...manageDeviceTrafficSessionsCreateSchema.partial().shape,
                ...manageDeviceTrafficSessionsRetrieveSchema.partial().shape,
                ...manageDeviceTrafficSessionsListSchema.partial().shape,
                ...manageDeviceTrafficSessionsDeleteSchema.partial().shape,
                ...manageDeviceMediaSessionsCreateSchema.partial().shape,
                ...manageDeviceMediaSessionsDeleteSchema.partial().shape,
                ...manageDeviceMediaSessionsActivateSchema.partial().shape,
                deviceId: z.string().optional().describe('Required for every operation except count and summary.'),
                name: z.string().max(64).optional(),
            },
        },
        async (input: { operation: ManageDeviceOperation; deviceId?: string; name?: string }) => {
            const fieldError = disallowedFieldError(
                input.operation,
                MANAGE_DEVICE_FIELDS[input.operation],
                MANAGE_DEVICE_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);
            if (input.operation === 'recordings_trajectory')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsTrajectory(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsTrajectorySchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'recordings_video')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsVideo(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsVideoSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'screenshots_image')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceScreenshotsImage(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceScreenshotsImageSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'stop')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceStop(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                    ),
                );
            if (input.operation === 'resume')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceResume(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                    ),
                );
            if (input.operation === 'summary')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceSummary(manageDeviceSummarySchema.strip().parse(input)),
                );
            if (input.operation === 'retrieve_capabilities')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRetrieveCapabilities(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                    ),
                );
            if (input.operation === 'recordings_list')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsList(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsListSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'recordings_delete')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsDelete(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsDeleteSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'recordings_screenshots')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsScreenshots(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsScreenshotsSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'recordings_start')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsStart(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsStartSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'recordings_status')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsStatus(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsStatusSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'recordings_stop')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceRecordingsStop(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceRecordingsStopSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'screenshots_list')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceScreenshotsList(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceScreenshotsListSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'screenshots_delete')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceScreenshotsDelete(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceScreenshotsDeleteSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'screenshots_capture')
                return asImageResult(
                    await ctx.backend.deviceControl.manageDeviceScreenshotsCapture(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceScreenshotsCaptureSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'traffic_sessions_create')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceTrafficSessionsCreate(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceTrafficSessionsCreateSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'traffic_sessions_retrieve')
                return asTextResult(
                    redactTrafficStream(
                        await ctx.backend.deviceControl.manageDeviceTrafficSessionsRetrieve(
                            requireValue(input.deviceId, 'deviceId', input.operation),
                            manageDeviceTrafficSessionsRetrieveSchema.strip().parse(input),
                        ),
                        ctx,
                    ),
                );
            if (input.operation === 'traffic_sessions_list')
                return asTextResult(
                    redactTrafficStream(
                        await ctx.backend.deviceControl.manageDeviceTrafficSessionsList(
                            requireValue(input.deviceId, 'deviceId', input.operation),
                            manageDeviceTrafficSessionsListSchema.strip().parse(input),
                        ),
                        ctx,
                    ),
                );
            if (input.operation === 'traffic_sessions_delete')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceTrafficSessionsDelete(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceTrafficSessionsDeleteSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'media_sessions_create')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceMediaSessionsCreate(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceMediaSessionsCreateSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'media_sessions_delete')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceMediaSessionsDelete(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceMediaSessionsDeleteSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'media_sessions_activate')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceMediaSessionsActivate(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceMediaSessionsActivateSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'media_sessions_retrieve_current')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceMediaSessionsRetrieveCurrent(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                    ),
                );

            const { operation } = input;

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
    clipboard_get: Object.keys(deviceActionClipboardGetSchema.shape),
    clipboard_set: Object.keys(deviceActionClipboardSetSchema.shape),
    deep_link: Object.keys(deviceActionDeepLinkSchema.shape),
    browser_script: Object.keys(deviceActionBrowserScriptSchema.shape),

    tap: ['x', 'y', 'pacedInput'],
    swipe: ['startX', 'startY', 'endX', 'endY', 'duration', 'pacedInput'],
    keyboard_write: ['text', 'clear', 'errorRate', 'pacedInput', 'wpm'],
    keyboard_key: ['key'],
    keyboard_clear: [],
    global_action: ['action'],
};
for (const operation of DEVICE_ACTION_OPERATIONS) {
    DEVICE_ACTION_FIELDS[operation] = [...DEVICE_ACTION_FIELDS[operation], 'displayId'];
}
const DEVICE_ACTION_FIELD_KEYS = [...new Set(Object.values(DEVICE_ACTION_FIELDS).flat())];

function registerDeviceAction(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(DEVICE_ACTION_OPERATIONS, ctx.policy.operationAllowlist?.get('device_action'));
    server.registerTool(
        'device_action',
        {
            description:
                'Low-level device input. Operations: tap (x, y), swipe (startX, startY, endX, endY, duration ms), keyboard_write (text, clear?, errorRate?, wpm?, pacedInput?), keyboard_key (key: Android keycode), keyboard_clear, global_action (action: Android global-action code, e.g. back/home/recents). `pacedInput` (tap/swipe/keyboard_write) sends input with variable timing and gesture paths instead of instant events, where supported. Per-call `displayId` targets a specific display on multi-display devices.' +
                ' Additional operations: clipboard_get: Read clipboard text. clipboard_set: Write clipboard text. deep_link: Open a URL or app link. browser_script: Run a script in the device browser.' +
                allowedValuesNote(values, DEVICE_ACTION_OPERATIONS),
            inputSchema: {
                operation: z.enum(DEVICE_ACTION_OPERATIONS),
                ...deviceActionClipboardGetSchema.partial().shape,
                ...deviceActionClipboardSetSchema.partial().shape,
                ...deviceActionDeepLinkSchema.partial().shape,
                ...deviceActionBrowserScriptSchema.partial().shape,
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
                action: z
                    .union([z.number().int(), deviceActionDeepLinkSchema.shape.action.unwrap()])
                    .optional()
                    .describe('global_action: Android keycode; deep_link: intent action.'),
            },
        },
        async (
            input: { operation: DeviceActionOperation; deviceId: string; displayId?: number } & Record<string, unknown>,
        ) => {
            const fieldError = disallowedFieldError(
                input.operation,
                DEVICE_ACTION_FIELDS[input.operation],
                DEVICE_ACTION_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);
            if (input.operation === 'clipboard_get')
                return asTextResult(
                    await ctx.backend.deviceControl.deviceActionClipboardGet(
                        input.deviceId,
                        deviceActionClipboardGetSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'clipboard_set')
                return asTextResult(
                    await ctx.backend.deviceControl.deviceActionClipboardSet(
                        input.deviceId,
                        deviceActionClipboardSetSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'deep_link')
                return asTextResult(
                    await ctx.backend.deviceControl.deviceActionDeepLink(
                        input.deviceId,
                        deviceActionDeepLinkSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'browser_script')
                return asTextResult(
                    await ctx.backend.deviceControl.deviceActionBrowserScript(
                        input.deviceId,
                        deviceActionBrowserScriptSchema.strip().parse(input),
                    ),
                );

            const { operation, deviceId, displayId } = input;

            const backend = ctx.backend.deviceControl;
            // Keep the backend port name while the client adapter sends humanize.
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
                    action: z
                        .number()
                        .int()
                        .parse(requireValue(input.action, 'action', operation)),
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
    grant_permission: Object.keys(manageDeviceAppsGrantPermissionSchema.shape),
    revoke_permission: Object.keys(manageDeviceAppsRevokePermissionSchema.shape),
    list_installs: Object.keys(manageDeviceAppsListInstallsSchema.shape),

    install: ['packageName', 'bundleId'],
    delete: ['packageName'],
    start: ['packageName', 'activity'],
    stop: ['packageName'],
    list_packages: ['includeSystemPackages', 'includeProtectedPackages'],
};
const MANAGE_APPS_FIELD_KEYS = [...new Set(Object.values(MANAGE_APPS_FIELDS).flat())];

function registerManageDeviceApps(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_APPS_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device_apps'));
    server.registerTool(
        'manage_device_apps',
        {
            description:
                'Mutate apps on a device. Operations: install (packageName and/or bundleId — at least one), delete (packageName), start (packageName, activity?), stop (packageName), list_packages (raw installed package names, includeSystemPackages?, includeProtectedPackages?). Read app metadata (label, versions) via list_apps_on_device instead.' +
                ' Additional operations: grant_permission: Grant an app notification permission. revoke_permission: Revoke an app notification permission. list_installs: Read app installation jobs.' +
                allowedValuesNote(values, MANAGE_APPS_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_APPS_OPERATIONS),
                ...manageDeviceAppsGrantPermissionSchema.partial().shape,
                ...manageDeviceAppsRevokePermissionSchema.partial().shape,
                ...manageDeviceAppsListInstallsSchema.partial().shape,
                deviceId: z.string(),
                packageName: z.string().optional(),
                bundleId: z.string().optional().describe('iOS bundle identifier (install only).'),
                activity: z.string().optional().describe('start only: specific activity to launch.'),
                includeSystemPackages: z.boolean().optional(),
                includeProtectedPackages: z.boolean().optional(),
            },
        },
        async (input: { operation: ManageAppsOperation; deviceId: string } & Record<string, unknown>) => {
            const fieldError = disallowedFieldError(
                input.operation,
                MANAGE_APPS_FIELDS[input.operation],
                MANAGE_APPS_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);
            if (input.operation === 'grant_permission')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceAppsGrantPermission(
                        input.deviceId,
                        manageDeviceAppsGrantPermissionSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'revoke_permission')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceAppsRevokePermission(
                        input.deviceId,
                        manageDeviceAppsRevokePermissionSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'list_installs')
                return asTextResult(
                    await ctx.backend.deviceControl.manageDeviceAppsListInstalls(
                        input.deviceId,
                        manageDeviceAppsListInstallsSchema.strip().parse(input),
                    ),
                );

            const { operation, deviceId } = input;

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
    reset_location: Object.keys(configureDeviceResetLocationSchema.shape),
    kiosk_enable: Object.keys(configureDeviceKioskEnableSchema.shape),
    kiosk_disable: Object.keys(configureDeviceKioskDisableSchema.shape),
    update_profile: Object.keys(configureDeviceUpdateProfileSchema.shape),

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
const CONFIGURE_DEVICE_FIELD_KEYS = [...new Set(Object.values(CONFIGURE_DEVICE_FIELDS).flat())];

function registerConfigureDevice(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(CONFIGURE_DEVICE_OPERATIONS, ctx.policy.operationAllowlist?.get('configure_device'));
    server.registerTool(
        'configure_device',
        {
            description:
                'Read/write device settings. Operations: get_language/set_language (locale: BCP-47 e.g. en-US; restart? forces the change to apply immediately instead of on next reboot), get_timezone/set_timezone (IANA tz), get_location/set_location (latitude, longitude), get_time (read-only device clock), get_overlay/set_overlay (visible: the on-device debug/annotation overlay), proxy_connect (proxyName? and/or smartIp?, or socks5Host+socks5Port+socks5User?+socks5Password? for a SOCKS5 proxy; smartIp defaults to true — aligns the device location, time zone, locale, and carrier settings with the proxy region; pass false to connect without changing device settings), proxy_disconnect, get_proxy_status.' +
                ' Additional operations: reset_location: Reset the device location. kiosk_enable: Enable kiosk mode for an app. kiosk_disable: Disable kiosk mode. update_profile: Update device profile settings.' +
                allowedValuesNote(values, CONFIGURE_DEVICE_OPERATIONS),
            inputSchema: {
                operation: z.enum(CONFIGURE_DEVICE_OPERATIONS),
                ...configureDeviceResetLocationSchema.partial().shape,
                ...configureDeviceKioskEnableSchema.partial().shape,
                ...configureDeviceKioskDisableSchema.partial().shape,
                ...configureDeviceUpdateProfileSchema.partial().shape,
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
            const fieldError = disallowedFieldError(
                input.operation,
                CONFIGURE_DEVICE_FIELDS[input.operation],
                CONFIGURE_DEVICE_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);
            if (input.operation === 'reset_location')
                return asTextResult(
                    await ctx.backend.deviceControl.configureDeviceResetLocation(
                        input.deviceId,
                        configureDeviceResetLocationSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'kiosk_enable')
                return asTextResult(
                    await ctx.backend.deviceControl.configureDeviceKioskEnable(
                        input.deviceId,
                        configureDeviceKioskEnableSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'kiosk_disable')
                return asTextResult(
                    await ctx.backend.deviceControl.configureDeviceKioskDisable(
                        input.deviceId,
                        configureDeviceKioskDisableSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'update_profile')
                return asTextResult(
                    await ctx.backend.deviceControl.configureDeviceUpdateProfile(
                        input.deviceId,
                        configureDeviceUpdateProfileSchema.strip().parse(input),
                    ),
                );

            const { operation, deviceId } = input;

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

export const MANAGE_ESIM_OPERATIONS = [
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
    set_roaming: Object.keys(manageEsimSetRoamingSchema.shape),
    status: Object.keys(manageEsimStatusSchema.shape),
    apn_list: Object.keys(manageEsimApnListSchema.shape),
    apn_select: Object.keys(manageEsimApnSelectSchema.shape),
    apn_set: Object.keys(manageEsimApnSetSchema.shape),

    list: [],
    activate: ['enable', 'smDpAddr', 'confirmationCode', 'matchingId'],
    enable: ['subId'],
    remove: ['subId'],
};
const MANAGE_ESIM_FIELD_KEYS = [...new Set(Object.values(MANAGE_ESIM_FIELDS).flat())];

function registerManageEsim(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_ESIM_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_esim'));
    server.registerTool(
        'manage_esim',
        {
            description:
                'eSIM subscription management. Operations: list, activate (smDpAddr required, enable: whether to also enable the downloaded profile, confirmationCode?/matchingId? — confirmationCode requires matchingId, only needed when the SM-DP+ challenges for it), enable (subId), remove (subId).' +
                ' Additional operations: set_roaming: Enable or disable eSIM roaming. status: Read eSIM connectivity status. apn_list: List available access point settings. apn_select: Select an access point. apn_set: Set access point settings.' +
                allowedValuesNote(values, MANAGE_ESIM_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_ESIM_OPERATIONS),
                ...manageEsimSetRoamingSchema.partial().shape,
                ...manageEsimStatusSchema.partial().shape,
                ...manageEsimApnListSchema.partial().shape,
                ...manageEsimApnSelectSchema.partial().shape,
                ...manageEsimApnSetSchema.partial().shape,
                deviceId: z.string(),
                enable: z.boolean().optional(),
                smDpAddr: z.string().optional(),
                confirmationCode: z.string().optional(),
                matchingId: z.string().optional(),
                subId: z.number().int().optional(),
            },
        },
        async (input: { operation: ManageEsimOperation; deviceId: string } & Record<string, unknown>) => {
            const fieldError = disallowedFieldError(
                input.operation,
                MANAGE_ESIM_FIELDS[input.operation],
                MANAGE_ESIM_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);
            if (input.operation === 'set_roaming')
                return asTextResult(
                    await ctx.backend.deviceControl.manageEsimSetRoaming(
                        input.deviceId,
                        manageEsimSetRoamingSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'status')
                return asTextResult(
                    await ctx.backend.deviceControl.manageEsimStatus(
                        input.deviceId,
                        manageEsimStatusSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'apn_list')
                return asTextResult(
                    await ctx.backend.deviceControl.manageEsimApnList(
                        input.deviceId,
                        manageEsimApnListSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'apn_select')
                return asTextResult(
                    await ctx.backend.deviceControl.manageEsimApnSelect(
                        input.deviceId,
                        manageEsimApnSelectSchema.strip().parse(input),
                    ),
                );
            if (input.operation === 'apn_set')
                return asTextResult(
                    await ctx.backend.deviceControl.manageEsimApnSet(
                        input.deviceId,
                        manageEsimApnSetSchema.strip().parse(input),
                    ),
                );

            const { operation, deviceId } = input;

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
