import {
    manageDeviceRecordingsDeleteSchema,
    manageDeviceRecordingsListSchema,
    manageDeviceRecordingsScreenshotsSchema,
    manageDeviceRecordingsStartSchema,
    manageDeviceRecordingsStatusSchema,
    manageDeviceRecordingsStopSchema,
    manageDeviceRecordingsTrajectorySchema,
    manageDeviceRecordingsVideoSchema,
    manageDeviceResumeSchema,
    manageDeviceRetrieveCapabilitiesSchema,
    manageDeviceScreenshotsCaptureSchema,
    manageDeviceScreenshotsDeleteSchema,
    manageDeviceScreenshotsImageSchema,
    manageDeviceScreenshotsListSchema,
    manageDeviceStopSchema,
    manageDeviceSummarySchema,
    manageDeviceTrafficSessionsCreateSchema,
    manageDeviceTrafficSessionsDeleteSchema,
    manageDeviceTrafficSessionsListSchema,
    manageDeviceTrafficSessionsRetrieveSchema,
} from '../backend/device-control.js';
import { operation, requireValue, sdkOp } from './operation-table.js';

import { z } from 'zod';
import { MAX_INLINE_FILE_BYTES } from '../inline-limits.js';
import { type ToolCtx } from '../ctx.js';
import { asImageResult, asTextResult } from '../text-result.js';

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

export const MANAGE_DEVICE_SHARED_FIELDS = {
    deviceId: z.string().optional().describe('Required for every operation except count and summary.'),
    name: z.string().max(64).optional(),
};

export const MANAGE_DEVICE_INTRO = 'Device lifecycle, recordings, screenshots and traffic capture.';
export const MANAGE_DEVICE_TABLE = [
    sdkOp(
        'recordings_trajectory',
        manageDeviceRecordingsTrajectorySchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsTrajectory(deviceId, params),
        'read',
        {
            doc: 'Read a short-lived signed download URL for a recording trajectory.',
            deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId,
        },
    ),
    sdkOp(
        'recordings_video',
        manageDeviceRecordingsVideoSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsVideo(deviceId, params),
        'read',
        { doc: 'Read a short-lived signed video download URL.', deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'screenshots_image',
        manageDeviceScreenshotsImageSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceScreenshotsImage(deviceId, params),
        'read',
        { doc: 'Read a short-lived signed image download URL.', deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    operation({
        op: 'reboot',
        input: { deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: 'Reboot a device.',
        run: async (ctx, input) => {
            const deviceId = requireValue(input.deviceId, 'deviceId', input.operation);
            await ctx.backend.deviceControl.rebootDevice(deviceId);
            return asTextResult({ status: 'reboot_requested', deviceId });
        },
    }),
    operation({
        op: 'reset',
        input: { deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'write',
        destructive: true,
        doc: 'Factory-reset a device to a fresh state (destructive).',
        run: async (ctx, input) => {
            const deviceId = requireValue(input.deviceId, 'deviceId', input.operation);
            await ctx.backend.deviceControl.resetDevice(deviceId);
            return asTextResult({ status: 'reset_requested', deviceId });
        },
    }),
    operation({
        op: 'rename',
        input: { name: MANAGE_DEVICE_SHARED_FIELDS.name, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: 'Rename a device; requires name.',
        run: async (ctx, input) => {
            const deviceId = requireValue(input.deviceId, 'deviceId', input.operation);
            const name = requireValue(input.name, 'name', input.operation);
            await ctx.backend.deviceControl.renameDevice(deviceId, name);
            return asTextResult(await ctx.backend.devices.getDevice(deviceId));
        },
    }),
    operation({
        op: 'wait_ready',
        input: { deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: 'Block until state=ready.',
        run: async (ctx, input) => {
            const deviceId = requireValue(input.deviceId, 'deviceId', input.operation);
            await ctx.backend.deviceControl.waitDeviceReady(deviceId);
            return asTextResult(await ctx.backend.devices.getDevice(deviceId));
        },
    }),
    operation({
        op: 'get_capabilities',
        input: { deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: 'Read the device profile: carrier, display, identifiers and model.',
        run: async (ctx, input) =>
            asTextResult(await ctx.backend.deviceControl.getDeviceCapabilities(requireValue(input.deviceId, 'deviceId', input.operation))),
    }),
    sdkOp('count', z.object({}), (ctx) => ctx.backend.deviceControl.countDevices(), 'read', {
        doc: 'Read claimed-device counts by state without deviceId.',
    }),
    sdkOp(
        'stop',
        manageDeviceStopSchema,
        (ctx, _params, deviceId) => ctx.backend.deviceControl.manageDeviceStop(deviceId),
        'commerce',
        {
            doc: 'Stop a device; affects device billing.',
            deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId,
        },
    ),
    sdkOp(
        'resume',
        manageDeviceResumeSchema,
        (ctx, _params, deviceId) => ctx.backend.deviceControl.manageDeviceResume(deviceId),
        'commerce',
        {
            doc: 'Resume a device; affects device billing.',
            deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId,
        },
    ),
    sdkOp('summary', manageDeviceSummarySchema, (ctx, params) => ctx.backend.deviceControl.manageDeviceSummary(params), 'read', {
        doc: 'Read account usage without deviceId.',
    }),
    sdkOp(
        'retrieve_capabilities',
        manageDeviceRetrieveCapabilitiesSchema,
        (ctx, _params, deviceId) => ctx.backend.deviceControl.manageDeviceRetrieveCapabilities(deviceId),
        'read',
        {
            doc: 'Read supported device features.',
            deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId,
        },
    ),
    sdkOp(
        'recordings_list',
        manageDeviceRecordingsListSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsList(deviceId, params),
        'read',
        { doc: 'List device recordings.', deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'recordings_delete',
        manageDeviceRecordingsDeleteSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsDelete(deviceId, params),
        'write',
        { destructive: true, doc: 'Delete a recording.', deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'recordings_screenshots',
        manageDeviceRecordingsScreenshotsSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsScreenshots(deviceId, params),
        'read',
        { doc: 'Read recording screenshot metadata.', deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'recordings_start',
        manageDeviceRecordingsStartSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsStart(deviceId, params),
        'write',
        { doc: 'Start a recording.', deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'recordings_status',
        manageDeviceRecordingsStatusSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsStatus(deviceId, params),
        'read',
        { doc: 'Read recording status.', deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'recordings_stop',
        manageDeviceRecordingsStopSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsStop(deviceId, params),
        'write',
        { doc: 'Stop a recording.', deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'screenshots_list',
        manageDeviceScreenshotsListSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceScreenshotsList(deviceId, params),
        'read',
        { doc: 'List stored screenshots.', deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'screenshots_delete',
        manageDeviceScreenshotsDeleteSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceScreenshotsDelete(deviceId, params),
        'write',
        { destructive: true, doc: 'Delete a stored screenshot.', deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'screenshots_capture',
        manageDeviceScreenshotsCaptureSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceScreenshotsCapture(deviceId, params),
        'write',
        {
            doc: `Capture a PNG image up to ${MAX_INLINE_FILE_BYTES / 1024} KB; save stores device media.`,
            deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId,
            result: (_ctx, value) => asImageResult(value),
        },
    ),
    // Traffic-session reads redact stream tokens when policy denies this creation operation.
    sdkOp(
        'traffic_sessions_create',
        manageDeviceTrafficSessionsCreateSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceTrafficSessionsCreate(deviceId, params),
        'write',
        {
            doc: 'Create a traffic session to capture network activity.',
            deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId,
        },
    ),
    sdkOp(
        'traffic_sessions_retrieve',
        manageDeviceTrafficSessionsRetrieveSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceTrafficSessionsRetrieve(deviceId, params),
        'read',
        {
            doc: 'Read a traffic session.',
            deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId,
            result: (ctx, value) => asTextResult(redactTrafficStream(value, ctx)),
        },
    ),
    sdkOp(
        'traffic_sessions_list',
        manageDeviceTrafficSessionsListSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceTrafficSessionsList(deviceId, params),
        'read',
        {
            doc: 'List traffic sessions.',
            deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId,
            result: (ctx, value) => asTextResult(redactTrafficStream(value, ctx)),
        },
    ),
    sdkOp(
        'traffic_sessions_delete',
        manageDeviceTrafficSessionsDeleteSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceTrafficSessionsDelete(deviceId, params),
        'write',
        { destructive: true, doc: 'Delete a traffic session.', deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
    ),
] as const;
