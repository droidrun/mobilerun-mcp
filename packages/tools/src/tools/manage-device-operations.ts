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



export const MANAGE_DEVICE_TABLE = [
    sdkOp('recordings_trajectory', manageDeviceRecordingsTrajectorySchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsTrajectory(deviceId, params), 'read', { fieldOrder: 0, describe: { order: 11, text: 'recordings_trajectory return short-lived signed download URLs.' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('recordings_video', manageDeviceRecordingsVideoSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsVideo(deviceId, params), 'read', { fieldOrder: 1, describe: { order: 10, text: 'recordings_video and ' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('screenshots_image', manageDeviceScreenshotsImageSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceScreenshotsImage(deviceId, params), 'read', { fieldOrder: 2, describe: { order: 9, text: 'screenshots_image, ' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    operation({
        op: 'reboot',
        input: { deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 24,
        access: 'write',
        describe: { order: 0, text: 'Device lifecycle operations. Operations: reboot, ' },
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
        fieldOrder: 25,
        access: 'write',
        describe: { order: 1, text: 'reset (factory-reset to a fresh state — destructive), ' },
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
        fieldOrder: 26,
        access: 'write',
        describe: { order: 2, text: 'rename (needs name), ' },
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
        fieldOrder: 27,
        access: 'read',
        describe: { order: 3, text: 'wait_ready (blocks until state=ready), ' },
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
        fieldOrder: 28,
        access: 'read',
        describe: { order: 4, text: 'get_capabilities (device profile: carrier, display, identifiers, model), ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.deviceControl;
            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            return asTextResult(await backend.getDeviceCapabilities(deviceId));
        },
    }),
    sdkOp('count', z.object({}), (ctx, params) => ctx.backend.deviceControl.countDevices(), 'read', { fieldOrder: 29, describe: { order: 5, text: 'count (claimed-device counts by state — no deviceId). ' } }),
    operation({
        op: 'stop',
        input: { ...manageDeviceStopSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 3,
        access: 'commerce',
        describe: { order: 6, text: 'stop/' },
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
        fieldOrder: 4,
        access: 'commerce',
        describe: { order: 7, text: 'resume affect device billing. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceResume(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                ),
            );
        },
    }),
    sdkOp('summary', manageDeviceSummarySchema, (ctx, params) => ctx.backend.deviceControl.manageDeviceSummary(params), 'read', { fieldOrder: 5, describe: {
            order: 8,
            text: 'summary reads account usage without deviceId. Recordings support list, start, stop, status, deletion and screenshot metadata. Screenshot capture returns a PNG image up to 256 KB; save stores device media. Traffic sessions capture network activity; media sessions control camera and microphone streams. ',
        } }),
    operation({
        op: 'retrieve_capabilities',
        input: { ...manageDeviceRetrieveCapabilitiesSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 6,
        access: 'read',
        describe: { order: 24, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceRetrieveCapabilities(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                ),
            );
        },
    }),
    sdkOp('recordings_list', manageDeviceRecordingsListSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsList(deviceId, params), 'read', { fieldOrder: 7, describe: { order: 25, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('recordings_delete', manageDeviceRecordingsDeleteSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsDelete(deviceId, params), 'write', { fieldOrder: 8, describe: { order: 26, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('recordings_screenshots', manageDeviceRecordingsScreenshotsSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsScreenshots(deviceId, params), 'read', { fieldOrder: 9, describe: { order: 27, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('recordings_start', manageDeviceRecordingsStartSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsStart(deviceId, params), 'write', { fieldOrder: 10, describe: { order: 28, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('recordings_status', manageDeviceRecordingsStatusSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsStatus(deviceId, params), 'read', { fieldOrder: 11, describe: { order: 29, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('recordings_stop', manageDeviceRecordingsStopSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceRecordingsStop(deviceId, params), 'write', { fieldOrder: 12, describe: { order: 30, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('screenshots_list', manageDeviceScreenshotsListSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceScreenshotsList(deviceId, params), 'read', { fieldOrder: 13, describe: { order: 31, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('screenshots_delete', manageDeviceScreenshotsDeleteSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceScreenshotsDelete(deviceId, params), 'write', { fieldOrder: 14, describe: { order: 32, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    operation({
        op: 'screenshots_capture',
        input: { ...manageDeviceScreenshotsCaptureSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 15,
        access: 'write',
        describe: { order: 33, text: '' },
        run: async (ctx, input) => {
            return asImageResult(
                await ctx.backend.deviceControl.manageDeviceScreenshotsCapture(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceScreenshotsCaptureSchema.strip().parse(input),
                ),
            );
        },
    }),
    sdkOp('traffic_sessions_create', manageDeviceTrafficSessionsCreateSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceTrafficSessionsCreate(deviceId, params), 'write', { fieldOrder: 16, describe: { order: 34, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    operation({
        op: 'traffic_sessions_retrieve',
        input: { ...manageDeviceTrafficSessionsRetrieveSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 17,
        access: 'read',
        describe: { order: 35, text: '' },
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
        fieldOrder: 18,
        access: 'read',
        describe: { order: 36, text: '' },
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
    sdkOp('traffic_sessions_delete', manageDeviceTrafficSessionsDeleteSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceTrafficSessionsDelete(deviceId, params), 'write', { fieldOrder: 19, describe: { order: 37, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('media_sessions_create', manageDeviceMediaSessionsCreateSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceMediaSessionsCreate(deviceId, params), 'write', { fieldOrder: 20, describe: { order: 38, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('media_sessions_delete', manageDeviceMediaSessionsDeleteSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceMediaSessionsDelete(deviceId, params), 'write', { fieldOrder: 21, describe: { order: 39, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('media_sessions_activate', manageDeviceMediaSessionsActivateSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceMediaSessionsActivate(deviceId, params), 'write', { fieldOrder: 22, describe: { order: 40, text: '' }, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId }),
    operation({
        op: 'media_sessions_retrieve_current',
        input: { ...manageDeviceMediaSessionsRetrieveCurrentSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 23,
        access: 'read',
        describe: { order: 41, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceMediaSessionsRetrieveCurrent(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                ),
            );
        },
    }),
] as const;
