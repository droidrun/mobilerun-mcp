import { type Operation, selectInput } from './operation-table.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { requireValue } from './op-helpers.js';
import {
    deviceActionClipboardGetSchema,
    deviceActionClipboardSetSchema,
    deviceActionDeepLinkSchema,
    deviceActionBrowserScriptSchema,
} from '../backend/device-control.js';

import { z } from 'zod';

import { asTextResult } from '../text-result.js';

export const DEVICE_ACTION_INPUT_FIELDS = {
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
};

type DeviceActionInput = z.infer<z.ZodObject<typeof DEVICE_ACTION_INPUT_FIELDS>> & {
    operation: string;
};

export const DEVICE_ACTION_TABLE = [
    {
        op: 'tap',
        input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...['x', 'y', 'pacedInput'], 'displayId']),
        fieldOrder: 4,
        readonly: false,
        billed: false,
        describe: { order: 0, text: 'Low-level device input. Operations: tap (x, y), ' },
        run: async (ctx, input) => {
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
        },
    },
    {
        op: 'swipe',
        input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [
            ...['startX', 'startY', 'endX', 'endY', 'duration', 'pacedInput'],
            'displayId',
        ]),
        fieldOrder: 5,
        readonly: false,
        billed: false,
        describe: { order: 1, text: 'swipe (startX, startY, endX, endY, duration ms), ' },
        run: async (ctx, input) => {
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
        },
    },
    {
        op: 'keyboard_write',
        input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [
            ...['text', 'clear', 'errorRate', 'pacedInput', 'wpm'],
            'displayId',
        ]),
        fieldOrder: 6,
        readonly: false,
        billed: false,
        describe: { order: 2, text: 'keyboard_write (text, clear?, errorRate?, wpm?, pacedInput?), ' },
        run: async (ctx, input) => {
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
        },
    },
    {
        op: 'keyboard_key',
        input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...['key'], 'displayId']),
        fieldOrder: 7,
        readonly: false,
        billed: false,
        describe: { order: 3, text: 'keyboard_key (key: Android keycode), ' },
        run: async (ctx, input) => {
            const { operation, deviceId, displayId } = input;
            const backend = ctx.backend.deviceControl;
            // Keep the backend port name while the client adapter sends humanize.
            await backend.keyboardKey({
                deviceId,
                displayId,
                key: requireValue(input.key as number | undefined, 'key', operation),
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    },
    {
        op: 'keyboard_clear',
        input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...[], 'displayId']),
        fieldOrder: 8,
        readonly: false,
        billed: false,
        describe: { order: 4, text: 'keyboard_clear, ' },
        run: async (ctx, input) => {
            const { operation, deviceId, displayId } = input;
            const backend = ctx.backend.deviceControl;
            // Keep the backend port name while the client adapter sends humanize.
            await backend.keyboardClear(deviceId, displayId);
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    },
    {
        op: 'global_action',
        input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...['action'], 'displayId']),
        fieldOrder: 9,
        readonly: false,
        billed: false,
        describe: {
            order: 5,
            text: 'global_action (action: Android global-action code, e.g. back/home/recents). `pacedInput` (tap/swipe/keyboard_write) sends input with variable timing and gesture paths instead of instant events, where supported. Per-call `displayId` targets a specific display on multi-display devices. Additional operations: ',
        },
        run: async (ctx, input) => {
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
        },
    },
    {
        op: 'clipboard_get',
        input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [
            ...Object.keys(deviceActionClipboardGetSchema.shape),
            'displayId',
        ]),
        fieldOrder: 0,
        fieldRepeats: ['displayId'],
        readonly: true,
        billed: false,
        describe: { order: 6, text: 'clipboard_get: Read clipboard text. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.deviceActionClipboardGet(
                    input.deviceId,
                    deviceActionClipboardGetSchema.strip().parse(input),
                ),
            );
        },
    },
    {
        op: 'clipboard_set',
        input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [
            ...Object.keys(deviceActionClipboardSetSchema.shape),
            'displayId',
        ]),
        fieldOrder: 1,
        fieldRepeats: ['displayId'],
        readonly: false,
        billed: false,
        describe: { order: 7, text: 'clipboard_set: Write clipboard text. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.deviceActionClipboardSet(
                    input.deviceId,
                    deviceActionClipboardSetSchema.strip().parse(input),
                ),
            );
        },
    },
    {
        op: 'deep_link',
        input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [...Object.keys(deviceActionDeepLinkSchema.shape), 'displayId']),
        fieldOrder: 2,
        fieldRepeats: ['displayId'],
        readonly: false,
        billed: false,
        describe: { order: 8, text: 'deep_link: Open a URL or app link. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.deviceActionDeepLink(
                    input.deviceId,
                    deviceActionDeepLinkSchema.strip().parse(input),
                ),
            );
        },
    },
    {
        op: 'browser_script',
        input: selectInput(DEVICE_ACTION_INPUT_FIELDS, [
            ...Object.keys(deviceActionBrowserScriptSchema.shape),
            'displayId',
        ]),
        fieldOrder: 3,
        fieldRepeats: ['displayId'],
        readonly: false,
        billed: false,
        describe: { order: 9, text: 'browser_script: Run a script in the device browser.' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.deviceActionBrowserScript(
                    input.deviceId,
                    deviceActionBrowserScriptSchema.strip().parse(input),
                ),
            );
        },
    },
] as const satisfies readonly Operation<DeviceActionInput, CallToolResult>[];
