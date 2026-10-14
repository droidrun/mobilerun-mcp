import { operation } from './operation-table.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { requireValue } from './op-helpers.js';

import { z } from 'zod';

import { asErrorResult, asTextResult } from '../text-result.js';

import { MAX_INLINE_FILE_BYTES, MAX_INLINE_BASE64_CHARS } from '../inline-limits.js';

// Device file transfers use a 256 KB decoded inline limit because the SDK
// offers no signed-URL transfer alternative for these device files.
export const MANAGE_FILES_SHARED_FIELDS = {
    deviceId: z.string(),
    path: z.string().min(1),
};



export const MANAGE_FILES_TABLE = [
    operation({
        op: 'list',
        input: { deviceId: MANAGE_FILES_SHARED_FIELDS.deviceId, path: MANAGE_FILES_SHARED_FIELDS.path },
        fieldOrder: 0,
        access: 'read',
        describe: { order: 0, text: 'Device filesystem access. Operations: list (directory entries at `path`), ' },
        run: async (ctx, input) => {
            const { operation, deviceId, path } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.listFiles(deviceId, { path }));
        },
    }),
    operation({
        op: 'upload',
        input: { contentBase64: z.string().max(MAX_INLINE_BASE64_CHARS).optional(), fileName: z.string().optional(), contentType: z.string().optional(), deviceId: MANAGE_FILES_SHARED_FIELDS.deviceId, path: MANAGE_FILES_SHARED_FIELDS.path },
        fieldOrder: 1,
        access: 'write',
        describe: {
            order: 1,
            text: 'upload (write `contentBase64` to `path`; decoded payload capped at 256KB — larger files are rejected), ',
        },
        run: async (ctx, input) => {
            const { operation, deviceId, path } = input;
            const backend = ctx.backend.deviceControl;
            const contentBase64 = requireValue(input.contentBase64 as string | undefined, 'contentBase64', operation);
            if (contentBase64.length > MAX_INLINE_BASE64_CHARS) {
                return asErrorResult(
                    `upload payload exceeds the ${MAX_INLINE_FILE_BYTES / 1024}KB inline limit — use a smaller file.`,
                );
            }
            await backend.uploadFile(deviceId, {
                path,
                contentBase64,
                fileName: input.fileName as string | undefined,
                contentType: input.contentType as string | undefined,
            });
            return asTextResult({ status: 'uploaded', deviceId, path });
        },
    }),
    operation({
        op: 'download',
        input: { deviceId: MANAGE_FILES_SHARED_FIELDS.deviceId, path: MANAGE_FILES_SHARED_FIELDS.path },
        fieldOrder: 2,
        access: 'read',
        describe: { order: 2, text: 'download (read `path`; oversized results are rejected the same way), ' },
        run: async (ctx, input) => {
            const { operation, deviceId, path } = input;
            const backend = ctx.backend.deviceControl;
            const result = await backend.downloadFile(deviceId, path);
            if (result.content.length > MAX_INLINE_BASE64_CHARS) {
                return asErrorResult(
                    `device file at "${path}" exceeds the ${MAX_INLINE_FILE_BYTES / 1024}KB inline transfer limit.`,
                );
            }
            return asTextResult(result);
        },
    }),
    operation({
        op: 'delete',
        input: { deviceId: MANAGE_FILES_SHARED_FIELDS.deviceId, path: MANAGE_FILES_SHARED_FIELDS.path },
        fieldOrder: 3,
        access: 'write',
        describe: { order: 3, text: 'delete (`path`). `path` is required for every operation.' },
        run: async (ctx, input) => {
            const { operation, deviceId, path } = input;
            const backend = ctx.backend.deviceControl;
            await backend.deleteFile(deviceId, path);
            return asTextResult({ status: 'deleted', deviceId, path });
        },
    }),
] as const;
