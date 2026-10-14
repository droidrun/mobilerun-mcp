import { operation, sdkOp } from './operation-table.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { requireValue } from './op-helpers.js';
import {
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
} from '../backend/device-control.js';

import { z } from 'zod';
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



export const MANAGE_DEVICE_INTRO = "Device lifecycle, recordings, screenshots, traffic capture and camera/microphone streams.";
export const MANAGE_DEVICE_TABLE = [
    sdkOp('recordings_trajectory', manageDeviceRecordingsTrajectorySchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsTrajectory(deviceId, params), 'read', { doc: "Read a short-lived signed download URL for a recording trajectory.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('recordings_video', manageDeviceRecordingsVideoSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsVideo(deviceId, params), 'read', { doc: "Read a short-lived signed video download URL.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('screenshots_image', manageDeviceScreenshotsImageSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceScreenshotsImage(deviceId, params), 'read', { doc: "Read a short-lived signed image download URL.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    operation({
        op: 'reboot',
        input: { deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: "Reboot a device.",
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.deviceControl;
            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            await backend.rebootDevice(deviceId);
            return asTextResult({ status: 'reboot_requested', deviceId });
        },
    }),
    operation({
        op: 'reset',
        input: { deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: "Factory-reset a device to a fresh state (destructive).",
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.deviceControl;
            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            await backend.resetDevice(deviceId);
            return asTextResult({ status: 'reset_requested', deviceId });
        },
    }),
    operation({
        op: 'rename',
        input: { name: MANAGE_DEVICE_SHARED_FIELDS.name, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: "Rename a device; requires name.",
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.deviceControl;
            const devices = ctx.backend.devices;
            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            const name = requireValue(input.name, 'name', operation);
            await backend.renameDevice(deviceId, name);
            return asTextResult(await devices.getDevice(deviceId));
        },
    }),
    operation({
        op: 'wait_ready',
        input: { deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: "Block until state=ready.",
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.deviceControl;
            const devices = ctx.backend.devices;
            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            await backend.waitDeviceReady(deviceId);
            return asTextResult(await devices.getDevice(deviceId));
        },
    }),
    operation({
        op: 'get_capabilities',
        input: { deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: "Read the device profile: carrier, display, identifiers and model.",
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.deviceControl;
            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            return asTextResult(await backend.getDeviceCapabilities(deviceId));
        },
    }),
    sdkOp('count', z.object({}), (ctx, params) => ctx.backend.deviceControl.countDevices(), 'read', { doc: "Read claimed-device counts by state without deviceId." }),
    operation({
        op: 'stop',
        input: { ...manageDeviceStopSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'commerce',
        doc: "Stop a device; affects device billing.",
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceStop(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                ),
            );
        },
    }),
    operation({
        op: 'resume',
        input: { ...manageDeviceResumeSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'commerce',
        doc: "Resume a device; affects device billing.",
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceResume(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                ),
            );
        },
    }),
    sdkOp('summary', manageDeviceSummarySchema, (ctx, params) => ctx.backend.deviceControl.manageDeviceSummary(params), 'read', { doc: "Read account usage without deviceId." }),
    operation({
        op: 'retrieve_capabilities',
        input: { ...manageDeviceRetrieveCapabilitiesSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: "Read supported device features.",
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceRetrieveCapabilities(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                ),
            );
        },
    }),
    sdkOp('recordings_list', manageDeviceRecordingsListSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsList(deviceId, params), 'read', { doc: "List device recordings.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('recordings_delete', manageDeviceRecordingsDeleteSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsDelete(deviceId, params), 'write', { doc: "Delete a recording.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('recordings_screenshots', manageDeviceRecordingsScreenshotsSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsScreenshots(deviceId, params), 'read', { doc: "Read recording screenshot metadata.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('recordings_start', manageDeviceRecordingsStartSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsStart(deviceId, params), 'write', { doc: "Start a recording.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('recordings_status', manageDeviceRecordingsStatusSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsStatus(deviceId, params), 'read', { doc: "Read recording status.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('recordings_stop', manageDeviceRecordingsStopSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsStop(deviceId, params), 'write', { doc: "Stop a recording.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('screenshots_list', manageDeviceScreenshotsListSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceScreenshotsList(deviceId, params), 'read', { doc: "List stored screenshots.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('screenshots_delete', manageDeviceScreenshotsDeleteSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceScreenshotsDelete(deviceId, params), 'write', { doc: "Delete a stored screenshot.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    operation({
        op: 'screenshots_capture',
        input: { ...manageDeviceScreenshotsCaptureSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: "Capture a PNG image up to 256 KB; save stores device media.",
        run: async (ctx, input) => {
            return asImageResult(
                await ctx.backend.deviceControl.manageDeviceScreenshotsCapture(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceScreenshotsCaptureSchema.strip().parse(input),
                ),
            );
        },
    }),
    // Traffic-session reads redact stream tokens when policy denies this creation operation.
    sdkOp('traffic_sessions_create', manageDeviceTrafficSessionsCreateSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceTrafficSessionsCreate(deviceId, params), 'write', { doc: "Create a traffic session to capture network activity.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    operation({
        op: 'traffic_sessions_retrieve',
        input: { ...manageDeviceTrafficSessionsRetrieveSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: "Read a traffic session.",
        run: async (ctx, input) => {
            return asTextResult(
                redactTrafficStream(
                    await ctx.backend.deviceControl.manageDeviceTrafficSessionsRetrieve(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceTrafficSessionsRetrieveSchema.strip().parse(input),
                    ),
                    ctx,
                ),
            );
        },
    }),
    operation({
        op: 'traffic_sessions_list',
        input: { ...manageDeviceTrafficSessionsListSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: "List traffic sessions.",
        run: async (ctx, input) => {
            return asTextResult(
                redactTrafficStream(
                    await ctx.backend.deviceControl.manageDeviceTrafficSessionsList(
                        requireValue(input.deviceId, 'deviceId', input.operation),
                        manageDeviceTrafficSessionsListSchema.strip().parse(input),
                    ),
                    ctx,
                ),
            );
        },
    }),
    sdkOp('traffic_sessions_delete', manageDeviceTrafficSessionsDeleteSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceTrafficSessionsDelete(deviceId, params), 'write', { doc: "Delete a traffic session.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('media_sessions_create', manageDeviceMediaSessionsCreateSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceMediaSessionsCreate(deviceId, params), 'write', { doc: "Create a camera or microphone stream.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('media_sessions_delete', manageDeviceMediaSessionsDeleteSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceMediaSessionsDelete(deviceId, params), 'write', { doc: "Delete a media session.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('media_sessions_activate', manageDeviceMediaSessionsActivateSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceMediaSessionsActivate(deviceId, params), 'write', { doc: "Activate a media session.", deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    operation({
        op: 'media_sessions_retrieve_current',
        input: { ...manageDeviceMediaSessionsRetrieveCurrentSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: "Read the current media session.",
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceMediaSessionsRetrieveCurrent(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                ),
            );
        },
    }),
] as const;
