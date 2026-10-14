import { operation } from './operation-table.js';
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

export const DEVICE_ACTION_SHARED_FIELDS = {
    deviceId: z.string(),
    displayId: z.number().int().optional(),
    pacedInput: z
        .boolean()
        .optional()
        .describe('tap/swipe/keyboard_write: send input with variable timing and gesture paths.'),
    text: z.string().optional(),
    action: z
        .union([z.number().int(), deviceActionDeepLinkSchema.shape.action.unwrap()])
        .optional()
        .describe('global_action: Android keycode; deep_link: intent action.'),
};



export const DEVICE_ACTION_TABLE = [
    operation({
        op: 'tap',
        input: { x: z.number().optional(), y: z.number().optional(), pacedInput: DEVICE_ACTION_SHARED_FIELDS.pacedInput, displayId: DEVICE_ACTION_SHARED_FIELDS.displayId, deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
        fieldOrder: 4,
        access: 'write',
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
    }),
    operation({
        op: 'swipe',
        input: { startX: z.number().optional(), startY: z.number().optional(), endX: z.number().optional(), endY: z.number().optional(), duration: z.number().int().positive().optional().describe('Swipe duration in milliseconds.'), pacedInput: DEVICE_ACTION_SHARED_FIELDS.pacedInput, displayId: DEVICE_ACTION_SHARED_FIELDS.displayId, deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
        fieldOrder: 5,
        access: 'write',
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
    }),
    operation({
        op: 'keyboard_write',
        input: { text: DEVICE_ACTION_SHARED_FIELDS.text, clear: z.boolean().optional().describe('keyboard_write: clear existing input before typing.'), errorRate: z
        .number()
        .optional()
        .describe(
            'keyboard_write with pacedInput: correction rate per character (backspace and retype). -1 uses the default.',
        ), pacedInput: DEVICE_ACTION_SHARED_FIELDS.pacedInput, wpm: z
        .number()
        .optional()
        .describe('keyboard_write with pacedInput: typing speed in words per minute. 0 uses the default.'), displayId: DEVICE_ACTION_SHARED_FIELDS.displayId, deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
        fieldOrder: 6,
        access: 'write',
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
    }),
    operation({
        op: 'keyboard_key',
        input: { key: z.number().int().optional().describe('keyboard_key: Android keycode.'), displayId: DEVICE_ACTION_SHARED_FIELDS.displayId, deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
        fieldOrder: 7,
        access: 'write',
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
    }),
    operation({
        op: 'keyboard_clear',
        input: { displayId: DEVICE_ACTION_SHARED_FIELDS.displayId, deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
        fieldOrder: 8,
        access: 'write',
        describe: { order: 4, text: 'keyboard_clear, ' },
        run: async (ctx, input) => {
            const { operation, deviceId, displayId } = input;
            const backend = ctx.backend.deviceControl;
            // Keep the backend port name while the client adapter sends humanize.
            await backend.keyboardClear(deviceId, displayId);
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    }),
    operation({
        op: 'global_action',
        input: { action: DEVICE_ACTION_SHARED_FIELDS.action, displayId: DEVICE_ACTION_SHARED_FIELDS.displayId, deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
        fieldOrder: 9,
        access: 'write',
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
    }),
    operation({
        op: 'clipboard_get',
        input: { ...deviceActionClipboardGetSchema.partial().shape, displayId: DEVICE_ACTION_SHARED_FIELDS.displayId, deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
        fieldOrder: 0,
        fieldRepeats: ['displayId'],
        access: 'read',
        describe: { order: 6, text: 'clipboard_get: Read clipboard text. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.deviceActionClipboardGet(
                    input.deviceId,
                    deviceActionClipboardGetSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'clipboard_set',
        input: { ...deviceActionClipboardSetSchema.partial().shape, text: DEVICE_ACTION_SHARED_FIELDS.text, displayId: DEVICE_ACTION_SHARED_FIELDS.displayId, deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
        fieldOrder: 1,
        fieldRepeats: ['displayId'],
        access: 'write',
        describe: { order: 7, text: 'clipboard_set: Write clipboard text. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.deviceActionClipboardSet(
                    input.deviceId,
                    deviceActionClipboardSetSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'deep_link',
        input: { ...deviceActionDeepLinkSchema.partial().shape, action: DEVICE_ACTION_SHARED_FIELDS.action, displayId: DEVICE_ACTION_SHARED_FIELDS.displayId, deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
        fieldOrder: 2,
        fieldRepeats: ['displayId'],
        access: 'write',
        describe: { order: 8, text: 'deep_link: Open a URL or app link. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.deviceActionDeepLink(
                    input.deviceId,
                    deviceActionDeepLinkSchema.strip().parse(input),
                ),
            );
        },
    }),
    operation({
        op: 'browser_script',
        input: { ...deviceActionBrowserScriptSchema.partial().shape, displayId: DEVICE_ACTION_SHARED_FIELDS.displayId, deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
        fieldOrder: 3,
        fieldRepeats: ['displayId'],
        access: 'write',
        describe: { order: 9, text: 'browser_script: Run a script in the device browser.' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.deviceActionBrowserScript(
                    input.deviceId,
                    deviceActionBrowserScriptSchema.strip().parse(input),
                ),
            );
        },
    }),
] as const;
