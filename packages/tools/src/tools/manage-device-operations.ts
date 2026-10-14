import { operation } from './operation-table.js';
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
    operation({
        op: 'recordings_trajectory',
        input: { ...manageDeviceRecordingsTrajectorySchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 0,
        access: 'read',
        describe: { order: 11, text: 'recordings_trajectory return short-lived signed download URLs.' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceRecordingsTrajectory(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceRecordingsTrajectorySchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'recordings_video',
        input: { ...manageDeviceRecordingsVideoSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 1,
        access: 'read',
        describe: { order: 10, text: 'recordings_video and ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceRecordingsVideo(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceRecordingsVideoSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'screenshots_image',
        input: { ...manageDeviceScreenshotsImageSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 2,
        access: 'read',
        describe: { order: 9, text: 'screenshots_image, ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceScreenshotsImage(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceScreenshotsImageSchema.strip().parse(input),
                ),
            );
        },
    }),
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
    operation({
        op: 'count',
        input: {  },
        fieldOrder: 29,
        access: 'read',
        describe: { order: 5, text: 'count (claimed-device counts by state — no deviceId). ' },
        run: async (ctx, input) => {
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.countDevices());
        },
    }),
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
    operation({
        op: 'summary',
        input: { ...manageDeviceSummarySchema.partial().shape },
        fieldOrder: 5,
        access: 'read',
        describe: {
            order: 8,
            text: 'summary reads account usage without deviceId. Recordings support list, start, stop, status, deletion and screenshot metadata. Screenshot capture returns a PNG image up to 256 KB; save stores device media. Traffic sessions capture network activity; media sessions control camera and microphone streams. ',
        },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceSummary(manageDeviceSummarySchema.strip().parse(input)),
            );
        },
    }),
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
    operation({
        op: 'recordings_list',
        input: { ...manageDeviceRecordingsListSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 7,
        access: 'read',
        describe: { order: 25, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceRecordingsList(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceRecordingsListSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'recordings_delete',
        input: { ...manageDeviceRecordingsDeleteSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 8,
        access: 'write',
        describe: { order: 26, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceRecordingsDelete(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceRecordingsDeleteSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'recordings_screenshots',
        input: { ...manageDeviceRecordingsScreenshotsSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 9,
        access: 'read',
        describe: { order: 27, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceRecordingsScreenshots(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceRecordingsScreenshotsSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'recordings_start',
        input: { ...manageDeviceRecordingsStartSchema.partial().shape, name: MANAGE_DEVICE_SHARED_FIELDS.name, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 10,
        access: 'write',
        describe: { order: 28, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceRecordingsStart(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceRecordingsStartSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'recordings_status',
        input: { ...manageDeviceRecordingsStatusSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 11,
        access: 'read',
        describe: { order: 29, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceRecordingsStatus(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceRecordingsStatusSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'recordings_stop',
        input: { ...manageDeviceRecordingsStopSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 12,
        access: 'write',
        describe: { order: 30, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceRecordingsStop(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceRecordingsStopSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'screenshots_list',
        input: { ...manageDeviceScreenshotsListSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 13,
        access: 'read',
        describe: { order: 31, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceScreenshotsList(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceScreenshotsListSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'screenshots_delete',
        input: { ...manageDeviceScreenshotsDeleteSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 14,
        access: 'write',
        describe: { order: 32, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceScreenshotsDelete(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceScreenshotsDeleteSchema.strip().parse(input),
                ),
            );
        },
    }),
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
    operation({
        op: 'traffic_sessions_create',
        input: { ...manageDeviceTrafficSessionsCreateSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 16,
        access: 'write',
        describe: { order: 34, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceTrafficSessionsCreate(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceTrafficSessionsCreateSchema.strip().parse(input),
                ),
            );
        },
    }),
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
    operation({
        op: 'traffic_sessions_delete',
        input: { ...manageDeviceTrafficSessionsDeleteSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 19,
        access: 'write',
        describe: { order: 37, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceTrafficSessionsDelete(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceTrafficSessionsDeleteSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'media_sessions_create',
        input: { ...manageDeviceMediaSessionsCreateSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 20,
        access: 'write',
        describe: { order: 38, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceMediaSessionsCreate(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceMediaSessionsCreateSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'media_sessions_delete',
        input: { ...manageDeviceMediaSessionsDeleteSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 21,
        access: 'write',
        describe: { order: 39, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceMediaSessionsDelete(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceMediaSessionsDeleteSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'media_sessions_activate',
        input: { ...manageDeviceMediaSessionsActivateSchema.partial().shape, deviceId: MANAGE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 22,
        access: 'write',
        describe: { order: 40, text: '' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceMediaSessionsActivate(
                    requireValue(input.deviceId, 'deviceId', input.operation),
                    manageDeviceMediaSessionsActivateSchema.strip().parse(input),
                ),
            );
        },
    }),
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
