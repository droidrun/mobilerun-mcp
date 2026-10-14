import { type Operation, selectInput } from './operation-table.js';
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

export const MANAGE_DEVICE_INPUT_FIELDS = {
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
};

type ManageDeviceInput = z.infer<z.ZodObject<typeof MANAGE_DEVICE_INPUT_FIELDS>> & {
    operation: string;
};

export const MANAGE_DEVICE_TABLE = [
    {
        op: 'recordings_trajectory',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceRecordingsTrajectorySchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'recordings_video',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceRecordingsVideoSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'screenshots_image',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceScreenshotsImageSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'reboot',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, ['deviceId']),
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
    },
    {
        op: 'reset',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, ['deviceId']),
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
    },
    {
        op: 'rename',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...['name'], 'deviceId']),
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
    },
    {
        op: 'wait_ready',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, ['deviceId']),
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
    },
    {
        op: 'get_capabilities',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, ['deviceId']),
        fieldOrder: 28,
        access: 'read',
        describe: { order: 4, text: 'get_capabilities (device profile: carrier, display, identifiers, model), ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.deviceControl;
            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            return asTextResult(await backend.getDeviceCapabilities(deviceId));
        },
    },
    {
        op: 'count',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, []),
        fieldOrder: 29,
        access: 'read',
        describe: { order: 5, text: 'count (claimed-device counts by state — no deviceId). ' },
        run: async (ctx, input) => {
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.countDevices());
        },
    },
    {
        op: 'stop',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceStopSchema.shape), 'deviceId']),
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
    },
    {
        op: 'resume',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [...Object.keys(manageDeviceResumeSchema.shape), 'deviceId']),
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
    },
    {
        op: 'summary',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, Object.keys(manageDeviceSummarySchema.shape)),
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
    },
    {
        op: 'retrieve_capabilities',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceRetrieveCapabilitiesSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'recordings_list',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceRecordingsListSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'recordings_delete',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceRecordingsDeleteSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'recordings_screenshots',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceRecordingsScreenshotsSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'recordings_start',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceRecordingsStartSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'recordings_status',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceRecordingsStatusSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'recordings_stop',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceRecordingsStopSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'screenshots_list',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceScreenshotsListSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'screenshots_delete',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceScreenshotsDeleteSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'screenshots_capture',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceScreenshotsCaptureSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'traffic_sessions_create',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceTrafficSessionsCreateSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'traffic_sessions_retrieve',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceTrafficSessionsRetrieveSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'traffic_sessions_list',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceTrafficSessionsListSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'traffic_sessions_delete',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceTrafficSessionsDeleteSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'media_sessions_create',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceMediaSessionsCreateSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'media_sessions_delete',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceMediaSessionsDeleteSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'media_sessions_activate',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceMediaSessionsActivateSchema.shape),
            'deviceId',
        ]),
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
    },
    {
        op: 'media_sessions_retrieve_current',
        input: selectInput(MANAGE_DEVICE_INPUT_FIELDS, [
            ...Object.keys(manageDeviceMediaSessionsRetrieveCurrentSchema.shape),
            'deviceId',
        ]),
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
    },
] as const satisfies readonly Operation<ManageDeviceInput, CallToolResult>[];
