import { operation, sdkOp } from './operation-table.js';
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



export const DEVICE_ACTION_INTRO = "Low-level device input. pacedInput (tap/swipe/keyboard_write) sends input with variable timing and gesture paths instead of instant events, where supported. Per-call displayId targets a specific display on multi-display devices.";
export const DEVICE_ACTION_TABLE = [
    operation({
        op: 'tap',
        input: { x: z.number().optional(), y: z.number().optional(), pacedInput: DEVICE_ACTION_SHARED_FIELDS.pacedInput, displayId: DEVICE_ACTION_SHARED_FIELDS.displayId, deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: "Tap x, y.",
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
        access: 'write',
        doc: "Swipe startX, startY to endX, endY with duration in milliseconds.",
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
        access: 'write',
        doc: "Type text with optional clear, errorRate, wpm and pacedInput.",
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
        access: 'write',
        doc: "Send an Android keycode.",
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
        access: 'write',
        doc: "Clear keyboard input.",
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
        access: 'write',
        doc: "Send an Android global-action code, e.g. back/home/recents.",
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
    sdkOp('clipboard_get', deviceActionClipboardGetSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.deviceActionClipboardGet(deviceId, params), 'read', { doc: "Read clipboard text.", deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId }),
    sdkOp('clipboard_set', deviceActionClipboardSetSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.deviceActionClipboardSet(deviceId, params), 'write', { doc: "Write clipboard text.", deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId }),
    sdkOp('deep_link', deviceActionDeepLinkSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.deviceActionDeepLink(deviceId, params), 'write', { doc: "Open a URL or app link.", deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId }),
    sdkOp('browser_script', deviceActionBrowserScriptSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.deviceActionBrowserScript(deviceId, params), 'write', { doc: "Run a script in the device browser.", deviceId: DEVICE_ACTION_SHARED_FIELDS.deviceId }),
] as const;
