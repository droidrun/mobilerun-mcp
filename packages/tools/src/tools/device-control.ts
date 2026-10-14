import { type Operation, operationValues, selectInput, operationInput, operationDescription, runOperation, operationFields } from './operation-table.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { requireValue, disallowedFieldError } from './op-helpers.js';
// Device-control bundle tools, including device media and connectivity operations.
import { manageDeviceRecordingsTrajectorySchema, manageDeviceRecordingsVideoSchema, manageDeviceScreenshotsImageSchema, manageEsimSetRoamingSchema, manageEsimStatusSchema, manageEsimApnListSchema, manageEsimApnSelectSchema, manageEsimApnSetSchema, configureDeviceResetLocationSchema, configureDeviceKioskEnableSchema, configureDeviceKioskDisableSchema, configureDeviceUpdateProfileSchema, manageDeviceAppsGrantPermissionSchema, manageDeviceAppsRevokePermissionSchema, manageDeviceAppsListInstallsSchema, deviceActionClipboardGetSchema, deviceActionClipboardSetSchema, deviceActionDeepLinkSchema, deviceActionBrowserScriptSchema, manageDeviceStopSchema, manageDeviceResumeSchema, manageDeviceSummarySchema, manageDeviceRetrieveCapabilitiesSchema, manageDeviceRecordingsListSchema, manageDeviceRecordingsDeleteSchema, manageDeviceRecordingsScreenshotsSchema, manageDeviceRecordingsStartSchema, manageDeviceRecordingsStatusSchema, manageDeviceRecordingsStopSchema, manageDeviceScreenshotsListSchema, manageDeviceScreenshotsDeleteSchema, manageDeviceScreenshotsCaptureSchema, manageDeviceTrafficSessionsCreateSchema, manageDeviceTrafficSessionsRetrieveSchema, manageDeviceTrafficSessionsListSchema, manageDeviceTrafficSessionsDeleteSchema, manageDeviceMediaSessionsCreateSchema, manageDeviceMediaSessionsDeleteSchema, manageDeviceMediaSessionsActivateSchema, manageDeviceMediaSessionsRetrieveCurrentSchema, } from '../backend/device-control.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ToolCtx } from '../ctx.js';
import { asErrorResult, asImageResult, asTextResult, ifDefined } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
import { MAX_INLINE_FILE_BYTES, MAX_INLINE_BASE64_CHARS } from '../inline-limits.js';
function redactTrafficStream(value: unknown, ctx: ToolCtx): unknown {
    const allowed = ctx.policy.operationAllowlist?.get('manage_device');
    if (!allowed || allowed.has('traffic_sessions_create'))
        return value;
    function redact(node: unknown): unknown {
        if (Array.isArray(node))
            return node.map(redact);
        if (node && typeof node === 'object') {
            return Object.fromEntries(Object.entries(node).map(([key, entry]) => {
                if (key === 'stream' && entry && typeof entry === 'object') {
                    const { token: _token, ...rest } = entry as Record<string, unknown>;
                    return [key, redact(rest)];
                }
                return [key, redact(entry)];
            }));
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
const MANAGE_DEVICE_INPUT_FIELDS = {
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
    name: z.string().max(64).optional()
};
type MANAGE_DEVICE_INPUT = z.infer<z.ZodObject<typeof MANAGE_DEVICE_INPUT_FIELDS>> & {
    operation: string;
};
export const MANAGE_DEVICE_TABLE = [
    { op: "recordings_trajectory", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceRecordingsTrajectorySchema.shape), 'deviceId']), readonly: true, billed: false, describe: { "order": 11, "text": "recordings_trajectory return short-lived signed download URLs." }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceRecordingsTrajectory(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceRecordingsTrajectorySchema.strip().parse(input)));
        } },
    { op: "recordings_video", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceRecordingsVideoSchema.shape), 'deviceId']), readonly: true, billed: false, describe: { "order": 10, "text": "recordings_video and " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceRecordingsVideo(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceRecordingsVideoSchema.strip().parse(input)));
        } },
    { op: "screenshots_image", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceScreenshotsImageSchema.shape), 'deviceId']), readonly: true, billed: false, describe: { "order": 9, "text": "screenshots_image, " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceScreenshotsImage(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceScreenshotsImageSchema.strip().parse(input)));
        } },
    { op: "reboot", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...[], 'deviceId']), readonly: false, billed: false, describe: { "order": 0, "text": "Device lifecycle operations. Operations: reboot, " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.deviceControl;
            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            await backend.rebootDevice(deviceId);
            return asTextResult({ status: 'reboot_requested', deviceId });
        } },
    { op: "reset", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...[], 'deviceId']), readonly: false, billed: false, describe: { "order": 1, "text": "reset (factory-reset to a fresh state — destructive), " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.deviceControl;
            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            await backend.resetDevice(deviceId);
            return asTextResult({ status: 'reset_requested', deviceId });
        } },
    { op: "rename", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...['name'], 'deviceId']), readonly: false, billed: false, describe: { "order": 2, "text": "rename (needs name), " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.deviceControl;
            const devices = ctx.backend.devices;
            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            const name = requireValue(input.name, 'name', operation);
            await backend.renameDevice(deviceId, name);
            return asTextResult(await devices.getDevice(deviceId));
        } },
    { op: "wait_ready", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...[], 'deviceId']), readonly: true, billed: false, describe: { "order": 3, "text": "wait_ready (blocks until state=ready), " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.deviceControl;
            const devices = ctx.backend.devices;
            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            await backend.waitDeviceReady(deviceId);
            return asTextResult(await devices.getDevice(deviceId));
        } },
    { op: "get_capabilities", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...[], 'deviceId']), readonly: true, billed: false, describe: { "order": 4, "text": "get_capabilities (device profile: carrier, display, identifiers, model), " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.deviceControl;
            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            return asTextResult(await backend.getDeviceCapabilities(deviceId));
        } },
    { op: "count", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, []), readonly: true, billed: false, describe: { "order": 5, "text": "count (claimed-device counts by state — no deviceId). " }, run: async (ctx, input) => {
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.countDevices());
        } },
    { op: "stop", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceStopSchema.shape), 'deviceId']), readonly: false, billed: true, describe: { "order": 6, "text": "stop/" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceStop(requireValue(input.deviceId, 'deviceId', input.operation)));
        } },
    { op: "resume", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceResumeSchema.shape), 'deviceId']), readonly: false, billed: true, describe: { "order": 7, "text": "resume affect device billing. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceResume(requireValue(input.deviceId, 'deviceId', input.operation)));
        } },
    { op: "summary", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, Object.keys(manageDeviceSummarySchema.shape)), readonly: true, billed: false, describe: { "order": 8, "text": "summary reads account usage without deviceId. Recordings support list, start, stop, status, deletion and screenshot metadata. Screenshot capture returns a PNG image up to 256 KB; save stores device media. Traffic sessions capture network activity; media sessions control camera and microphone streams. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceSummary(manageDeviceSummarySchema.strip().parse(input)));
        } },
    { op: "retrieve_capabilities", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceRetrieveCapabilitiesSchema.shape), 'deviceId']), readonly: true, billed: false, describe: { "order": 24, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceRetrieveCapabilities(requireValue(input.deviceId, 'deviceId', input.operation)));
        } },
    { op: "recordings_list", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceRecordingsListSchema.shape), 'deviceId']), readonly: true, billed: false, describe: { "order": 25, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceRecordingsList(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceRecordingsListSchema.strip().parse(input)));
        } },
    { op: "recordings_delete", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceRecordingsDeleteSchema.shape), 'deviceId']), readonly: false, billed: false, describe: { "order": 26, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceRecordingsDelete(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceRecordingsDeleteSchema.strip().parse(input)));
        } },
    { op: "recordings_screenshots", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceRecordingsScreenshotsSchema.shape), 'deviceId']), readonly: true, billed: false, describe: { "order": 27, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceRecordingsScreenshots(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceRecordingsScreenshotsSchema.strip().parse(input)));
        } },
    { op: "recordings_start", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceRecordingsStartSchema.shape), 'deviceId']), readonly: false, billed: false, describe: { "order": 28, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceRecordingsStart(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceRecordingsStartSchema.strip().parse(input)));
        } },
    { op: "recordings_status", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceRecordingsStatusSchema.shape), 'deviceId']), readonly: true, billed: false, describe: { "order": 29, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceRecordingsStatus(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceRecordingsStatusSchema.strip().parse(input)));
        } },
    { op: "recordings_stop", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceRecordingsStopSchema.shape), 'deviceId']), readonly: false, billed: false, describe: { "order": 30, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceRecordingsStop(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceRecordingsStopSchema.strip().parse(input)));
        } },
    { op: "screenshots_list", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceScreenshotsListSchema.shape), 'deviceId']), readonly: true, billed: false, describe: { "order": 31, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceScreenshotsList(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceScreenshotsListSchema.strip().parse(input)));
        } },
    { op: "screenshots_delete", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceScreenshotsDeleteSchema.shape), 'deviceId']), readonly: false, billed: false, describe: { "order": 32, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceScreenshotsDelete(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceScreenshotsDeleteSchema.strip().parse(input)));
        } },
    { op: "screenshots_capture", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceScreenshotsCaptureSchema.shape), 'deviceId']), readonly: false, billed: false, describe: { "order": 33, "text": "" }, run: async (ctx, input) => {
            return asImageResult(await ctx.backend.deviceControl.manageDeviceScreenshotsCapture(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceScreenshotsCaptureSchema.strip().parse(input)));
        } },
    { op: "traffic_sessions_create", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceTrafficSessionsCreateSchema.shape), 'deviceId']), readonly: false, billed: false, describe: { "order": 34, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceTrafficSessionsCreate(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceTrafficSessionsCreateSchema.strip().parse(input)));
        } },
    { op: "traffic_sessions_retrieve", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceTrafficSessionsRetrieveSchema.shape), 'deviceId']), readonly: true, billed: false, describe: { "order": 35, "text": "" }, run: async (ctx, input) => {
            return asTextResult(redactTrafficStream(await ctx.backend.deviceControl.manageDeviceTrafficSessionsRetrieve(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceTrafficSessionsRetrieveSchema.strip().parse(input)), ctx));
        } },
    { op: "traffic_sessions_list", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceTrafficSessionsListSchema.shape), 'deviceId']), readonly: true, billed: false, describe: { "order": 36, "text": "" }, run: async (ctx, input) => {
            return asTextResult(redactTrafficStream(await ctx.backend.deviceControl.manageDeviceTrafficSessionsList(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceTrafficSessionsListSchema.strip().parse(input)), ctx));
        } },
    { op: "traffic_sessions_delete", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceTrafficSessionsDeleteSchema.shape), 'deviceId']), readonly: false, billed: false, describe: { "order": 37, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceTrafficSessionsDelete(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceTrafficSessionsDeleteSchema.strip().parse(input)));
        } },
    { op: "media_sessions_create", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceMediaSessionsCreateSchema.shape), 'deviceId']), readonly: false, billed: false, describe: { "order": 38, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceMediaSessionsCreate(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceMediaSessionsCreateSchema.strip().parse(input)));
        } },
    { op: "media_sessions_delete", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceMediaSessionsDeleteSchema.shape), 'deviceId']), readonly: false, billed: false, describe: { "order": 39, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceMediaSessionsDelete(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceMediaSessionsDeleteSchema.strip().parse(input)));
        } },
    { op: "media_sessions_activate", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceMediaSessionsActivateSchema.shape), 'deviceId']), readonly: false, billed: false, describe: { "order": 40, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceMediaSessionsActivate(requireValue(input.deviceId, 'deviceId', input.operation), manageDeviceMediaSessionsActivateSchema.strip().parse(input)));
        } },
    { op: "media_sessions_retrieve_current", input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceMediaSessionsRetrieveCurrentSchema.shape), 'deviceId']), readonly: true, billed: false, describe: { "order": 41, "text": "" }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceMediaSessionsRetrieveCurrent(requireValue(input.deviceId, 'deviceId', input.operation)));
        } },
] as const satisfies readonly Operation<MANAGE_DEVICE_INPUT, CallToolResult>[];
const DEVICE_ACTION_INPUT_FIELDS = {
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
        .describe('keyboard_write with pacedInput: correction rate per character (backspace and retype). -1 uses the default.'),
    wpm: z
        .number()
        .optional()
        .describe('keyboard_write with pacedInput: typing speed in words per minute. 0 uses the default.'),
    key: z.number().int().optional().describe('keyboard_key: Android keycode.'),
    action: z
        .union([z.number().int(), deviceActionDeepLinkSchema.shape.action.unwrap()])
        .optional()
        .describe('global_action: Android keycode; deep_link: intent action.')
};
type DEVICE_ACTION_INPUT = z.infer<z.ZodObject<typeof DEVICE_ACTION_INPUT_FIELDS>> & {
    operation: string;
};
export const DEVICE_ACTION_TABLE = [
    { op: "tap", input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...['x', 'y', 'pacedInput'], 'displayId']), readonly: false, billed: false, describe: { "order": 0, "text": "Low-level device input. Operations: tap (x, y), " }, run: async (ctx, input) => {
            const { operation, deviceId, displayId } = input;
            const backend = ctx.backend.deviceControl;
            // Keep the backend port name while the client adapter sends humanize.
            const stealth = input.pacedInput as boolean | undefined;
            await backend.tap({
                deviceId,
                displayId,
                stealth,
                x: requireValue(input.x as number | undefined, 'x', operation),
                y: requireValue(input.y as number | undefined, 'y', operation),
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        } },
    { op: "swipe", input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...['startX', 'startY', 'endX', 'endY', 'duration', 'pacedInput'], 'displayId']), readonly: false, billed: false, describe: { "order": 1, "text": "swipe (startX, startY, endX, endY, duration ms), " }, run: async (ctx, input) => {
            const { operation, deviceId, displayId } = input;
            const backend = ctx.backend.deviceControl;
            // Keep the backend port name while the client adapter sends humanize.
            const stealth = input.pacedInput as boolean | undefined;
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
            return asTextResult({ status: 'ok', operation, deviceId });
        } },
    { op: "keyboard_write", input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...['text', 'clear', 'errorRate', 'pacedInput', 'wpm'], 'displayId']), readonly: false, billed: false, describe: { "order": 2, "text": "keyboard_write (text, clear?, errorRate?, wpm?, pacedInput?), " }, run: async (ctx, input) => {
            const { operation, deviceId, displayId } = input;
            const backend = ctx.backend.deviceControl;
            // Keep the backend port name while the client adapter sends humanize.
            const stealth = input.pacedInput as boolean | undefined;
            await backend.keyboardWrite({
                deviceId,
                displayId,
                stealth,
                text: requireValue(input.text as string | undefined, 'text', operation),
                clear: input.clear as boolean | undefined,
                errorRate: input.errorRate as number | undefined,
                wpm: input.wpm as number | undefined,
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        } },
    { op: "keyboard_key", input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...['key'], 'displayId']), readonly: false, billed: false, describe: { "order": 3, "text": "keyboard_key (key: Android keycode), " }, run: async (ctx, input) => {
            const { operation, deviceId, displayId } = input;
            const backend = ctx.backend.deviceControl;
            // Keep the backend port name while the client adapter sends humanize.
            await backend.keyboardKey({
                deviceId,
                displayId,
                key: requireValue(input.key as number | undefined, 'key', operation),
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        } },
    { op: "keyboard_clear", input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...[], 'displayId']), readonly: false, billed: false, describe: { "order": 4, "text": "keyboard_clear, " }, run: async (ctx, input) => {
            const { operation, deviceId, displayId } = input;
            const backend = ctx.backend.deviceControl;
            // Keep the backend port name while the client adapter sends humanize.
            await backend.keyboardClear(deviceId, displayId);
            return asTextResult({ status: 'ok', operation, deviceId });
        } },
    { op: "global_action", input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...['action'], 'displayId']), readonly: false, billed: false, describe: { "order": 5, "text": "global_action (action: Android global-action code, e.g. back/home/recents). `pacedInput` (tap/swipe/keyboard_write) sends input with variable timing and gesture paths instead of instant events, where supported. Per-call `displayId` targets a specific display on multi-display devices. Additional operations: " }, run: async (ctx, input) => {
            const { operation, deviceId, displayId } = input;
            const backend = ctx.backend.deviceControl;
            // Keep the backend port name while the client adapter sends humanize.
            await backend.globalAction({
                deviceId,
                displayId,
                action: z
                    .number()
                    .int()
                    .parse(requireValue(input.action, 'action', operation)),
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        } },
    { op: "clipboard_get", input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...Object.keys(deviceActionClipboardGetSchema.shape), 'displayId']), readonly: true, billed: false, describe: { "order": 6, "text": "clipboard_get: Read clipboard text. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.deviceActionClipboardGet(input.deviceId, deviceActionClipboardGetSchema.strip().parse(input)));
        } },
    { op: "clipboard_set", input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...Object.keys(deviceActionClipboardSetSchema.shape), 'displayId']), readonly: false, billed: false, describe: { "order": 7, "text": "clipboard_set: Write clipboard text. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.deviceActionClipboardSet(input.deviceId, deviceActionClipboardSetSchema.strip().parse(input)));
        } },
    { op: "deep_link", input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...Object.keys(deviceActionDeepLinkSchema.shape), 'displayId']), readonly: false, billed: false, describe: { "order": 8, "text": "deep_link: Open a URL or app link. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.deviceActionDeepLink(input.deviceId, deviceActionDeepLinkSchema.strip().parse(input)));
        } },
    { op: "browser_script", input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...Object.keys(deviceActionBrowserScriptSchema.shape), 'displayId']), readonly: false, billed: false, describe: { "order": 9, "text": "browser_script: Run a script in the device browser." }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.deviceActionBrowserScript(input.deviceId, deviceActionBrowserScriptSchema.strip().parse(input)));
        } },
] as const satisfies readonly Operation<DEVICE_ACTION_INPUT, CallToolResult>[];
const MANAGE_APPS_INPUT_FIELDS = {
    ...manageDeviceAppsGrantPermissionSchema.partial().shape,
    ...manageDeviceAppsRevokePermissionSchema.partial().shape,
    ...manageDeviceAppsListInstallsSchema.partial().shape,
    deviceId: z.string(),
    packageName: z.string().optional(),
    bundleId: z.string().optional().describe('iOS bundle identifier (install only).'),
    activity: z.string().optional().describe('start only: specific activity to launch.'),
    includeSystemPackages: z.boolean().optional(),
    includeProtectedPackages: z.boolean().optional()
};
type MANAGE_APPS_INPUT = z.infer<z.ZodObject<typeof MANAGE_APPS_INPUT_FIELDS>> & {
    operation: string;
};
export const MANAGE_APPS_TABLE = [
    { op: "install", input: selectInput(MANAGE_APPS_INPUT_FIELDS, ['packageName', 'bundleId']), readonly: false, billed: false, describe: { "order": 0, "text": "Mutate apps on a device. Operations: install (packageName and/or bundleId — at least one), " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const bundleId = input.bundleId as string | undefined;
            if (!packageName && !bundleId)
                throw new Error('operation=install requires packageName and/or bundleId');
            await backend.installApp(deviceId, { packageName, bundleId });
            return asTextResult({ status: 'install_requested', deviceId, packageName, bundleId });
        } },
    { op: "delete", input: selectInput(MANAGE_APPS_INPUT_FIELDS, ['packageName']), readonly: false, billed: false, describe: { "order": 1, "text": "delete (packageName), " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const pkg = requireValue(packageName, 'packageName', operation);
            await backend.deleteApp(deviceId, pkg);
            return asTextResult({ status: 'ok', operation, deviceId, packageName: pkg });
        } },
    { op: "start", input: selectInput(MANAGE_APPS_INPUT_FIELDS, ['packageName', 'activity']), readonly: false, billed: false, describe: { "order": 2, "text": "start (packageName, activity?), " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const pkg = requireValue(packageName, 'packageName', operation);
            await backend.startApp(deviceId, pkg, { activity: input.activity as string | undefined });
            return asTextResult({ status: 'ok', operation, deviceId, packageName: pkg });
        } },
    { op: "stop", input: selectInput(MANAGE_APPS_INPUT_FIELDS, ['packageName']), readonly: false, billed: false, describe: { "order": 3, "text": "stop (packageName), " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const pkg = requireValue(packageName, 'packageName', operation);
            await backend.stopApp(deviceId, pkg);
            return asTextResult({ status: 'ok', operation, deviceId, packageName: pkg });
        } },
    { op: "list_packages", input: selectInput(MANAGE_APPS_INPUT_FIELDS, ['includeSystemPackages', 'includeProtectedPackages']), readonly: true, billed: false, describe: { "order": 4, "text": "list_packages (raw installed package names, includeSystemPackages?, includeProtectedPackages?). Read app metadata (label, versions) via list_apps_on_device instead. Additional operations: " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.listPackages(deviceId, {
                ...ifDefined('includeSystemPackages', input.includeSystemPackages as boolean | undefined),
                ...ifDefined('includeProtectedPackages', input.includeProtectedPackages as boolean | undefined),
            }));
        } },
    { op: "grant_permission", input: selectInput(MANAGE_APPS_INPUT_FIELDS, Object.keys(manageDeviceAppsGrantPermissionSchema.shape)), readonly: false, billed: false, describe: { "order": 5, "text": "grant_permission: Grant an app notification permission. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceAppsGrantPermission(input.deviceId, manageDeviceAppsGrantPermissionSchema.strip().parse(input)));
        } },
    { op: "revoke_permission", input: selectInput(MANAGE_APPS_INPUT_FIELDS, Object.keys(manageDeviceAppsRevokePermissionSchema.shape)), readonly: false, billed: false, describe: { "order": 6, "text": "revoke_permission: Revoke an app notification permission. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceAppsRevokePermission(input.deviceId, manageDeviceAppsRevokePermissionSchema.strip().parse(input)));
        } },
    { op: "list_installs", input: selectInput(MANAGE_APPS_INPUT_FIELDS, Object.keys(manageDeviceAppsListInstallsSchema.shape)), readonly: true, billed: false, describe: { "order": 7, "text": "list_installs: Read app installation jobs." }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageDeviceAppsListInstalls(input.deviceId, manageDeviceAppsListInstallsSchema.strip().parse(input)));
        } },
] as const satisfies readonly Operation<MANAGE_APPS_INPUT, CallToolResult>[];
const MANAGE_FILES_INPUT_FIELDS = {
    deviceId: z.string(),
    path: z.string().min(1),
    contentBase64: z.string().max(MAX_INLINE_BASE64_CHARS).optional(),
    fileName: z.string().optional(),
    contentType: z.string().optional()
};
type MANAGE_FILES_INPUT = z.infer<z.ZodObject<typeof MANAGE_FILES_INPUT_FIELDS>> & {
    operation: string;
};
export const MANAGE_FILES_TABLE = [
    { op: "list", input: selectInput(MANAGE_FILES_INPUT_FIELDS, []), readonly: true, billed: false, describe: { "order": 0, "text": "Device filesystem access. Operations: list (directory entries at `path`), " }, run: async (ctx, input) => {
            const { operation, deviceId, path } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.listFiles(deviceId, { path }));
        } },
    { op: "upload", input: selectInput(MANAGE_FILES_INPUT_FIELDS, ['contentBase64', 'fileName', 'contentType']), readonly: false, billed: false, describe: { "order": 1, "text": "upload (write `contentBase64` to `path`; decoded payload capped at 256KB — larger files are rejected), " }, run: async (ctx, input) => {
            const { operation, deviceId, path } = input;
            const backend = ctx.backend.deviceControl;
            const contentBase64 = requireValue(input.contentBase64 as string | undefined, 'contentBase64', operation);
            if (contentBase64.length > MAX_INLINE_BASE64_CHARS) {
                return asErrorResult(`upload payload exceeds the ${MAX_INLINE_FILE_BYTES / 1024}KB inline limit — use a smaller file.`);
            }
            await backend.uploadFile(deviceId, {
                path,
                contentBase64,
                fileName: input.fileName as string | undefined,
                contentType: input.contentType as string | undefined,
            });
            return asTextResult({ status: 'uploaded', deviceId, path });
        } },
    { op: "download", input: selectInput(MANAGE_FILES_INPUT_FIELDS, []), readonly: true, billed: false, describe: { "order": 2, "text": "download (read `path`; oversized results are rejected the same way), " }, run: async (ctx, input) => {
            const { operation, deviceId, path } = input;
            const backend = ctx.backend.deviceControl;
            const result = await backend.downloadFile(deviceId, path);
            if (result.content.length > MAX_INLINE_BASE64_CHARS) {
                return asErrorResult(`device file at "${path}" exceeds the ${MAX_INLINE_FILE_BYTES / 1024}KB inline transfer limit.`);
            }
            return asTextResult(result);
        } },
    { op: "delete", input: selectInput(MANAGE_FILES_INPUT_FIELDS, []), readonly: false, billed: false, describe: { "order": 3, "text": "delete (`path`). `path` is required for every operation." }, run: async (ctx, input) => {
            const { operation, deviceId, path } = input;
            const backend = ctx.backend.deviceControl;
            await backend.deleteFile(deviceId, path);
            return asTextResult({ status: 'deleted', deviceId, path });
        } },
] as const satisfies readonly Operation<MANAGE_FILES_INPUT, CallToolResult>[];
const CONFIGURE_DEVICE_INPUT_FIELDS = {
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
    socks5Password: z.string().optional()
};
type CONFIGURE_DEVICE_INPUT = z.infer<z.ZodObject<typeof CONFIGURE_DEVICE_INPUT_FIELDS>> & {
    operation: string;
};
export const CONFIGURE_DEVICE_TABLE = [
    { op: "get_language", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []), readonly: true, billed: false, describe: { "order": 0, "text": "Read/write device settings. Operations: get_language/" }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getLanguage(deviceId));
        } },
    { op: "set_language", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, ['locale', 'restart']), readonly: false, billed: false, describe: { "order": 1, "text": "set_language (locale: BCP-47 e.g. en-US; restart? forces the change to apply immediately instead of on next reboot), " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.setLanguage(deviceId, {
                locale: requireValue(input.locale as string | undefined, 'locale', operation),
                restart: input.restart as boolean | undefined,
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        } },
    { op: "get_timezone", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []), readonly: true, billed: false, describe: { "order": 2, "text": "get_timezone/" }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getTimezone(deviceId));
        } },
    { op: "set_timezone", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, ['timezone']), readonly: false, billed: false, describe: { "order": 3, "text": "set_timezone (IANA tz), " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.setTimezone(deviceId, requireValue(input.timezone as string | undefined, 'timezone', operation));
            return asTextResult({ status: 'ok', operation, deviceId });
        } },
    { op: "get_location", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []), readonly: true, billed: false, describe: { "order": 4, "text": "get_location/" }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getLocation(deviceId));
        } },
    { op: "set_location", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, ['latitude', 'longitude']), readonly: false, billed: false, describe: { "order": 5, "text": "set_location (latitude, longitude), " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.setLocation(deviceId, {
                latitude: requireValue(input.latitude as number | undefined, 'latitude', operation),
                longitude: requireValue(input.longitude as number | undefined, 'longitude', operation),
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        } },
    { op: "get_time", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []), readonly: true, billed: false, describe: { "order": 6, "text": "get_time (read-only device clock), " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getTime(deviceId));
        } },
    { op: "get_overlay", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []), readonly: true, billed: false, describe: { "order": 7, "text": "get_overlay/" }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getOverlay(deviceId));
        } },
    { op: "set_overlay", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, ['visible']), readonly: false, billed: false, describe: { "order": 8, "text": "set_overlay (visible: the on-device debug/annotation overlay), " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.setOverlay(deviceId, requireValue(input.visible as boolean | undefined, 'visible', operation));
            return asTextResult({ status: 'ok', operation, deviceId });
        } },
    { op: "proxy_connect", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, ['proxyName', 'smartIp', 'socks5Host', 'socks5Port', 'socks5User', 'socks5Password']), readonly: false, billed: false, describe: { "order": 9, "text": "proxy_connect (proxyName? and/or smartIp?, or socks5Host+socks5Port+socks5User?+socks5Password? for a SOCKS5 proxy; smartIp defaults to true — aligns the device location, time zone, locale, and carrier settings with the proxy region; pass false to connect without changing device settings), " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const socks5Host = input.socks5Host as string | undefined;
            const socks5Port = input.socks5Port as number | undefined;
            await backend.connectProxy(deviceId, {
                name: input.proxyName as string | undefined,
                // Default smart-IP on: align device location, time zone, locale, and carrier with the proxy region unless the caller explicitly opts out.
                smartIp: (input.smartIp as boolean | undefined) ?? true,
                socks5: socks5Host && socks5Port !== undefined
                    ? {
                        host: socks5Host,
                        port: socks5Port,
                        user: input.socks5User as string | undefined,
                        password: input.socks5Password as string | undefined,
                    }
                    : undefined,
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        } },
    { op: "proxy_disconnect", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []), readonly: false, billed: false, describe: { "order": 10, "text": "proxy_disconnect, " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.disconnectProxy(deviceId);
            return asTextResult({ status: 'ok', operation, deviceId });
        } },
    { op: "get_proxy_status", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []), readonly: true, billed: false, describe: { "order": 11, "text": "get_proxy_status. Additional operations: " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getProxyStatus(deviceId));
        } },
    { op: "reset_location", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, Object.keys(configureDeviceResetLocationSchema.shape)), readonly: false, billed: false, describe: { "order": 12, "text": "reset_location: Reset the device location. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.configureDeviceResetLocation(input.deviceId, configureDeviceResetLocationSchema.strip().parse(input)));
        } },
    { op: "kiosk_enable", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, Object.keys(configureDeviceKioskEnableSchema.shape)), readonly: false, billed: false, describe: { "order": 13, "text": "kiosk_enable: Enable kiosk mode for an app. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.configureDeviceKioskEnable(input.deviceId, configureDeviceKioskEnableSchema.strip().parse(input)));
        } },
    { op: "kiosk_disable", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, Object.keys(configureDeviceKioskDisableSchema.shape)), readonly: false, billed: false, describe: { "order": 14, "text": "kiosk_disable: Disable kiosk mode. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.configureDeviceKioskDisable(input.deviceId, configureDeviceKioskDisableSchema.strip().parse(input)));
        } },
    { op: "update_profile", input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, Object.keys(configureDeviceUpdateProfileSchema.shape)), readonly: false, billed: false, describe: { "order": 15, "text": "update_profile: Update device profile settings." }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.configureDeviceUpdateProfile(input.deviceId, configureDeviceUpdateProfileSchema.strip().parse(input)));
        } },
] as const satisfies readonly Operation<CONFIGURE_DEVICE_INPUT, CallToolResult>[];
const MANAGE_ESIM_INPUT_FIELDS = {
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
    subId: z.number().int().optional()
};
type MANAGE_ESIM_INPUT = z.infer<z.ZodObject<typeof MANAGE_ESIM_INPUT_FIELDS>> & {
    operation: string;
};
export const MANAGE_ESIM_TABLE = [
    { op: "list", input: selectInput(MANAGE_ESIM_INPUT_FIELDS, []), readonly: true, billed: false, describe: { "order": 0, "text": "eSIM subscription management. Operations: list, " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.listEsims(deviceId));
        } },
    { op: "activate", input: selectInput(MANAGE_ESIM_INPUT_FIELDS, ['enable', 'smDpAddr', 'confirmationCode', 'matchingId']), readonly: false, billed: true, describe: { "order": 1, "text": "activate (smDpAddr required, " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.activateEsim(deviceId, {
                enable: requireValue(input.enable as boolean | undefined, 'enable', operation),
                smDpAddr: requireValue(input.smDpAddr as string | undefined, 'smDpAddr', operation),
                confirmationCode: input.confirmationCode as string | undefined,
                matchingId: input.matchingId as string | undefined,
            }));
        } },
    { op: "enable", input: selectInput(MANAGE_ESIM_INPUT_FIELDS, ['subId']), readonly: false, billed: false, describe: { "order": 2, "text": "enable: whether to also enable the downloaded profile, confirmationCode?/matchingId? — confirmationCode requires matchingId, only needed when the SM-DP+ challenges for it), enable (subId), " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const subId = requireValue(input.subId as number | undefined, 'subId', operation);
            await backend.enableEsim(deviceId, subId);
            return asTextResult({ status: 'ok', operation, deviceId, subId });
        } },
    { op: "remove", input: selectInput(MANAGE_ESIM_INPUT_FIELDS, ['subId']), readonly: false, billed: false, describe: { "order": 3, "text": "remove (subId). Additional operations: " }, run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const subId = requireValue(input.subId as number | undefined, 'subId', operation);
            await backend.removeEsim(deviceId, subId);
            return asTextResult({ status: 'ok', operation, deviceId, subId });
        } },
    { op: "set_roaming", input: selectInput(MANAGE_ESIM_INPUT_FIELDS, Object.keys(manageEsimSetRoamingSchema.shape)), readonly: false, billed: false, describe: { "order": 4, "text": "set_roaming: Enable or disable eSIM roaming. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageEsimSetRoaming(input.deviceId, manageEsimSetRoamingSchema.strip().parse(input)));
        } },
    { op: "status", input: selectInput(MANAGE_ESIM_INPUT_FIELDS, Object.keys(manageEsimStatusSchema.shape)), readonly: true, billed: false, describe: { "order": 5, "text": "status: Read eSIM connectivity status. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageEsimStatus(input.deviceId, manageEsimStatusSchema.strip().parse(input)));
        } },
    { op: "apn_list", input: selectInput(MANAGE_ESIM_INPUT_FIELDS, Object.keys(manageEsimApnListSchema.shape)), readonly: true, billed: false, describe: { "order": 6, "text": "apn_list: List available access point settings. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageEsimApnList(input.deviceId, manageEsimApnListSchema.strip().parse(input)));
        } },
    { op: "apn_select", input: selectInput(MANAGE_ESIM_INPUT_FIELDS, Object.keys(manageEsimApnSelectSchema.shape)), readonly: false, billed: false, describe: { "order": 7, "text": "apn_select: Select an access point. " }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageEsimApnSelect(input.deviceId, manageEsimApnSelectSchema.strip().parse(input)));
        } },
    { op: "apn_set", input: selectInput(MANAGE_ESIM_INPUT_FIELDS, Object.keys(manageEsimApnSetSchema.shape)), readonly: false, billed: false, describe: { "order": 8, "text": "apn_set: Set access point settings." }, run: async (ctx, input) => {
            return asTextResult(await ctx.backend.deviceControl.manageEsimApnSet(input.deviceId, manageEsimApnSetSchema.strip().parse(input)));
        } },
] as const satisfies readonly Operation<MANAGE_ESIM_INPUT, CallToolResult>[];
export const MANAGE_DEVICE_OPERATIONS = operationValues(MANAGE_DEVICE_TABLE);
type ManageDeviceOperation = (typeof MANAGE_DEVICE_OPERATIONS)[number];
const MANAGE_DEVICE_FIELDS = operationFields(MANAGE_DEVICE_TABLE);
const MANAGE_DEVICE_FIELD_KEYS = [...new Set(Object.values(MANAGE_DEVICE_FIELDS).flat())];
function registerManageDevice(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_DEVICE_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device'));
    server.registerTool('manage_device', {
        description: operationDescription(MANAGE_DEVICE_TABLE) + allowedValuesNote(values, MANAGE_DEVICE_OPERATIONS),
        inputSchema: { operation: z.enum(MANAGE_DEVICE_OPERATIONS), ...operationInput(MANAGE_DEVICE_TABLE, MANAGE_DEVICE_INPUT_FIELDS, selectInput(MANAGE_DEVICE_INPUT_FIELDS, [])) },
    }, async (input: {
        operation: ManageDeviceOperation;
        deviceId?: string;
        name?: string;
    }) => {
        const fieldError = disallowedFieldError(input.operation, MANAGE_DEVICE_FIELDS[input.operation], MANAGE_DEVICE_FIELD_KEYS, input);
        if (fieldError)
            return asErrorResult(fieldError);
        return runOperation(MANAGE_DEVICE_TABLE, input.operation, ctx, input);
    });
}
// ---------------------------------------------------------------------------
// device_action
// ---------------------------------------------------------------------------
const DEVICE_ACTION_OPERATIONS = operationValues(DEVICE_ACTION_TABLE);
type DeviceActionOperation = (typeof DEVICE_ACTION_OPERATIONS)[number];
const DEVICE_ACTION_FIELDS = operationFields(DEVICE_ACTION_TABLE);
const DEVICE_ACTION_FIELD_KEYS = [...new Set(Object.values(DEVICE_ACTION_FIELDS).flat())];
function registerDeviceAction(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(DEVICE_ACTION_OPERATIONS, ctx.policy.operationAllowlist?.get('device_action'));
    server.registerTool('device_action', {
        description: operationDescription(DEVICE_ACTION_TABLE) + allowedValuesNote(values, DEVICE_ACTION_OPERATIONS),
        inputSchema: { operation: z.enum(DEVICE_ACTION_OPERATIONS), ...operationInput(DEVICE_ACTION_TABLE, DEVICE_ACTION_INPUT_FIELDS, selectInput(DEVICE_ACTION_INPUT_FIELDS, ["deviceId"])) },
    }, async (input: {
        operation: DeviceActionOperation;
        deviceId: string;
        displayId?: number;
    } & Record<string, unknown>) => {
        const fieldError = disallowedFieldError(input.operation, DEVICE_ACTION_FIELDS[input.operation], DEVICE_ACTION_FIELD_KEYS, input);
        if (fieldError)
            return asErrorResult(fieldError);
        return runOperation(DEVICE_ACTION_TABLE, input.operation, ctx, input);
    });
}
// ---------------------------------------------------------------------------
// manage_device_apps
// ---------------------------------------------------------------------------
const MANAGE_APPS_OPERATIONS = operationValues(MANAGE_APPS_TABLE);
type ManageAppsOperation = (typeof MANAGE_APPS_OPERATIONS)[number];
const MANAGE_APPS_FIELDS = operationFields(MANAGE_APPS_TABLE);
const MANAGE_APPS_FIELD_KEYS = [...new Set(Object.values(MANAGE_APPS_FIELDS).flat())];
function registerManageDeviceApps(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_APPS_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device_apps'));
    server.registerTool('manage_device_apps', {
        description: operationDescription(MANAGE_APPS_TABLE) + allowedValuesNote(values, MANAGE_APPS_OPERATIONS),
        inputSchema: { operation: z.enum(MANAGE_APPS_OPERATIONS), ...operationInput(MANAGE_APPS_TABLE, MANAGE_APPS_INPUT_FIELDS, selectInput(MANAGE_APPS_INPUT_FIELDS, ["deviceId"])) },
    }, async (input: {
        operation: ManageAppsOperation;
        deviceId: string;
    } & Record<string, unknown>) => {
        const fieldError = disallowedFieldError(input.operation, MANAGE_APPS_FIELDS[input.operation], MANAGE_APPS_FIELD_KEYS, input);
        if (fieldError)
            return asErrorResult(fieldError);
        return runOperation(MANAGE_APPS_TABLE, input.operation, ctx, input);
    });
}
// ---------------------------------------------------------------------------
// manage_device_files
// ---------------------------------------------------------------------------
const MANAGE_FILES_OPERATIONS = operationValues(MANAGE_FILES_TABLE);
type ManageFilesOperation = (typeof MANAGE_FILES_OPERATIONS)[number];
const MANAGE_FILES_FIELDS = operationFields(MANAGE_FILES_TABLE);
const MANAGE_FILES_FIELD_KEYS = ['contentBase64', 'fileName', 'contentType'] as const;
function registerManageDeviceFiles(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_FILES_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device_files'));
    server.registerTool('manage_device_files', {
        description: operationDescription(MANAGE_FILES_TABLE) + allowedValuesNote(values, MANAGE_FILES_OPERATIONS),
        inputSchema: { operation: z.enum(MANAGE_FILES_OPERATIONS), ...operationInput(MANAGE_FILES_TABLE, MANAGE_FILES_INPUT_FIELDS, selectInput(MANAGE_FILES_INPUT_FIELDS, ["deviceId", "path"])) },
    }, async (input: {
        operation: ManageFilesOperation;
        deviceId: string;
        path: string;
    } & Record<string, unknown>) => {
        const { operation, deviceId, path } = input;
        const fieldError = disallowedFieldError(operation, MANAGE_FILES_FIELDS[operation], MANAGE_FILES_FIELD_KEYS, input);
        if (fieldError)
            return asErrorResult(fieldError);
        return runOperation(MANAGE_FILES_TABLE, input.operation, ctx, input);
    });
}
// ---------------------------------------------------------------------------
// configure_device
// ---------------------------------------------------------------------------
const CONFIGURE_DEVICE_OPERATIONS = operationValues(CONFIGURE_DEVICE_TABLE);
type ConfigureDeviceOperation = (typeof CONFIGURE_DEVICE_OPERATIONS)[number];
const CONFIGURE_DEVICE_FIELDS = operationFields(CONFIGURE_DEVICE_TABLE);
const CONFIGURE_DEVICE_FIELD_KEYS = [...new Set(Object.values(CONFIGURE_DEVICE_FIELDS).flat())];
function registerConfigureDevice(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(CONFIGURE_DEVICE_OPERATIONS, ctx.policy.operationAllowlist?.get('configure_device'));
    server.registerTool('configure_device', {
        description: operationDescription(CONFIGURE_DEVICE_TABLE) + allowedValuesNote(values, CONFIGURE_DEVICE_OPERATIONS),
        inputSchema: { operation: z.enum(CONFIGURE_DEVICE_OPERATIONS), ...operationInput(CONFIGURE_DEVICE_TABLE, CONFIGURE_DEVICE_INPUT_FIELDS, selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, ["deviceId"])) },
    }, async (input: {
        operation: ConfigureDeviceOperation;
        deviceId: string;
    } & Record<string, unknown>) => {
        const fieldError = disallowedFieldError(input.operation, CONFIGURE_DEVICE_FIELDS[input.operation], CONFIGURE_DEVICE_FIELD_KEYS, input);
        if (fieldError)
            return asErrorResult(fieldError);
        return runOperation(CONFIGURE_DEVICE_TABLE, input.operation, ctx, input);
    });
}
// ---------------------------------------------------------------------------
// manage_esim
// ---------------------------------------------------------------------------
export const MANAGE_ESIM_OPERATIONS = operationValues(MANAGE_ESIM_TABLE);
type ManageEsimOperation = (typeof MANAGE_ESIM_OPERATIONS)[number];
const MANAGE_ESIM_FIELDS = operationFields(MANAGE_ESIM_TABLE);
const MANAGE_ESIM_FIELD_KEYS = [...new Set(Object.values(MANAGE_ESIM_FIELDS).flat())];
function registerManageEsim(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_ESIM_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_esim'));
    server.registerTool('manage_esim', {
        description: operationDescription(MANAGE_ESIM_TABLE) + allowedValuesNote(values, MANAGE_ESIM_OPERATIONS),
        inputSchema: { operation: z.enum(MANAGE_ESIM_OPERATIONS), ...operationInput(MANAGE_ESIM_TABLE, MANAGE_ESIM_INPUT_FIELDS, selectInput(MANAGE_ESIM_INPUT_FIELDS, ["deviceId"])) },
    }, async (input: {
        operation: ManageEsimOperation;
        deviceId: string;
    } & Record<string, unknown>) => {
        const fieldError = disallowedFieldError(input.operation, MANAGE_ESIM_FIELDS[input.operation], MANAGE_ESIM_FIELD_KEYS, input);
        if (fieldError)
            return asErrorResult(fieldError);
        return runOperation(MANAGE_ESIM_TABLE, input.operation, ctx, input);
    });
}
export function registerDeviceControlTools(server: McpServer, ctx: ToolCtx): void {
    registerManageDevice(server, ctx);
    registerDeviceAction(server, ctx);
    registerManageDeviceApps(server, ctx);
    registerManageDeviceFiles(server, ctx);
    registerConfigureDevice(server, ctx);
    registerManageEsim(server, ctx);
}
