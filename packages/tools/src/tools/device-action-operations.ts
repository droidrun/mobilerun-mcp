import {
    deviceActionBrowserScriptSchema,
    deviceActionClipboardGetSchema,
    deviceActionClipboardSetSchema,
    deviceActionDeepLinkSchema,
} from '../backend/device-control.js';
import { operation, requireValue, sdkOp } from './operation-table.js';

import { z } from 'zod';

import { asTextResult } from '../text-result.js';

export const DEVICE_ACTION_SHARED_FIELDS = {
    deviceId: z.string(),
    displayId: z.number().int().optional(),
    humanize: z.boolean().optional().describe('tap/swipe/keyboard_write: send input with variable timing and gesture paths.'),
    text: z.string().optional(),
    action: z
        .union([z.number().int(), deviceActionDeepLinkSchema.shape.action.unwrap()])
        .optional()
        .describe('global_action: Android keycode; deep_link: intent action.'),
};

export const DEVICE_ACTION_INTRO =
    'Low-level device input. humanize (tap/swipe/keyboard_write) sends input with variable timing and gesture paths instead of instant events, where supported. Per-call displayId targets a specific display on multi-display devices.';
export const DEVICE_ACTION_TABLE = [
    operation({
        op: 'tap',
        input: {
            x: z.number().optional(),
            y: z.number().optional(),
            humanize: DEVICE_ACTION_SHARED_FIELDS.humanize,
            displayId: DEVICE_ACTION_SHARED_FIELDS.displayId,
            deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId,
        },
        access: 'write',
        doc: 'Tap x, y.',
        run: async (ctx, input) => {
            const { deviceId, displayId } = input;

            await ctx.backend.deviceControl.tap({
                deviceId,
                displayId,
                humanize: input.humanize,
                x: requireValue(input.x, 'x', input.operation),
                y: requireValue(input.y, 'y', input.operation),
            });
            return asTextResult({ status: 'ok', operation: input.operation, deviceId });
        },
    }),
    operation({
        op: 'swipe',
        input: {
            startX: z.number().optional(),
            startY: z.number().optional(),
            endX: z.number().optional(),
            endY: z.number().optional(),
            duration: z.number().int().positive().optional().describe('Swipe duration in milliseconds.'),
            humanize: DEVICE_ACTION_SHARED_FIELDS.humanize,
            displayId: DEVICE_ACTION_SHARED_FIELDS.displayId,
            deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId,
        },
        access: 'write',
        doc: 'Swipe startX, startY to endX, endY with duration in milliseconds.',
        run: async (ctx, input) => {
            const { deviceId, displayId } = input;

            await ctx.backend.deviceControl.swipe({
                deviceId,
                displayId,
                humanize: input.humanize,
                startX: requireValue(input.startX, 'startX', input.operation),
                startY: requireValue(input.startY, 'startY', input.operation),
                endX: requireValue(input.endX, 'endX', input.operation),
                endY: requireValue(input.endY, 'endY', input.operation),
                duration: requireValue(input.duration, 'duration', input.operation),
            });
            return asTextResult({ status: 'ok', operation: input.operation, deviceId });
        },
    }),
    operation({
        op: 'keyboard_write',
        input: {
            text: DEVICE_ACTION_SHARED_FIELDS.text,
            clear: z.boolean().optional().describe('keyboard_write: clear existing input before typing.'),
            errorRate: z
                .number()
                .optional()
                .describe('keyboard_write with humanize: correction rate per character (backspace and retype). -1 uses the default.'),
            humanize: DEVICE_ACTION_SHARED_FIELDS.humanize,
            wpm: z.number().optional().describe('keyboard_write with humanize: typing speed in words per minute. 0 uses the default.'),
            displayId: DEVICE_ACTION_SHARED_FIELDS.displayId,
            deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId,
        },
        access: 'write',
        doc: 'Type text with optional clear, errorRate, wpm and humanize.',
        run: async (ctx, input) => {
            const { deviceId, displayId } = input;

            await ctx.backend.deviceControl.keyboardWrite({
                deviceId,
                displayId,
                humanize: input.humanize,
                text: requireValue(input.text, 'text', input.operation),
                clear: input.clear,
                errorRate: input.errorRate,
                wpm: input.wpm,
            });
            return asTextResult({ status: 'ok', operation: input.operation, deviceId });
        },
    }),
    operation({
        op: 'keyboard_key',
        input: {
            key: z.number().int().optional().describe('keyboard_key: Android keycode.'),
            displayId: DEVICE_ACTION_SHARED_FIELDS.displayId,
            deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId,
        },
        access: 'write',
        doc: 'Send an Android keycode.',
        run: async (ctx, input) => {
            const { deviceId, displayId } = input;

            await ctx.backend.deviceControl.keyboardKey({
                deviceId,
                displayId,
                key: requireValue(input.key, 'key', input.operation),
            });
            return asTextResult({ status: 'ok', operation: input.operation, deviceId });
        },
    }),
    operation({
        op: 'keyboard_clear',
        input: { displayId: DEVICE_ACTION_SHARED_FIELDS.displayId, deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: 'Clear keyboard input.',
        run: async (ctx, input) => {
            const { deviceId, displayId } = input;

            await ctx.backend.deviceControl.keyboardClear(deviceId, displayId);
            return asTextResult({ status: 'ok', operation: input.operation, deviceId });
        },
    }),
    operation({
        op: 'global_action',
        input: {
            action: DEVICE_ACTION_SHARED_FIELDS.action,
            displayId: DEVICE_ACTION_SHARED_FIELDS.displayId,
            deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId,
        },
        access: 'write',
        doc: 'Send an Android global-action code, e.g. back/home/recents.',
        run: async (ctx, input) => {
            const { deviceId, displayId } = input;

            await ctx.backend.deviceControl.globalAction({
                deviceId,
                displayId,
                action: z
                    .number()
                    .int()
                    .parse(requireValue(input.action, 'action', input.operation)),
            });
            return asTextResult({ status: 'ok', operation: input.operation, deviceId });
        },
    }),
    sdkOp(
        'clipboard_get',
        deviceActionClipboardGetSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.deviceActionClipboardGet(deviceId, params),
        'read',
        { doc: 'Read clipboard text.', deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'clipboard_set',
        deviceActionClipboardSetSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.deviceActionClipboardSet(deviceId, params),
        'write',
        { doc: 'Write clipboard text.', deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'deep_link',
        deviceActionDeepLinkSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.deviceActionDeepLink(deviceId, params),
        'write',
        { doc: 'Open a URL or app link.', deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'browser_script',
        deviceActionBrowserScriptSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.deviceActionBrowserScript(deviceId, params),
        'write',
        { doc: 'Run a script in the device browser.', deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
    ),
] as const;
