import { operation, requireValue } from './operation-table.js';

import { posix } from 'node:path';
import { z } from 'zod';

import { asErrorResult, asTextResult } from '../text-result.js';

import { MAX_INLINE_BASE64_CHARS, MAX_INLINE_FILE_BYTES } from '../inline-limits.js';

// Device file transfers use a 256 KB decoded inline limit because the SDK
// offers no signed-URL transfer alternative for these device files.
export const MANAGE_FILES_SHARED_FIELDS = {
    deviceId: z.string(),
    path: z.string().min(1).describe('Device path. For upload, the full target file path; when fileName is given, the target directory.'),
};

export const MANAGE_FILES_INTRO = 'Device filesystem access. path is required for every operation.';
export const MANAGE_FILES_TABLE = [
    operation({
        op: 'list',
        input: { deviceId: MANAGE_FILES_SHARED_FIELDS.deviceId, path: MANAGE_FILES_SHARED_FIELDS.path },
        access: 'read',
        doc: 'List directory entries at path.',
        run: async (ctx, input) => {
            const { deviceId, path } = input;

            return asTextResult(await ctx.backend.deviceControl.listFiles(deviceId, { path }));
        },
    }),
    operation({
        op: 'upload',
        input: {
            contentBase64: z.string().max(MAX_INLINE_BASE64_CHARS).optional(),
            fileName: z.string().optional().describe('Optional upload filename. When given, path is the target directory and both are passed unchanged.'),
            contentType: z.string().optional(),
            deviceId: MANAGE_FILES_SHARED_FIELDS.deviceId,
            path: MANAGE_FILES_SHARED_FIELDS.path,
        },
        access: 'write',
        doc: `Write contentBase64 to the full target file path, including a directory and filename. If fileName is given, path is the target directory; decoded payload capped at ${MAX_INLINE_FILE_BYTES / 1024}KB, larger files are rejected.`,
        run: async (ctx, input) => {
            const { deviceId, path } = input;

            const contentBase64 = requireValue(input.contentBase64, 'contentBase64', input.operation);
            if (contentBase64.length > MAX_INLINE_BASE64_CHARS) {
                return asErrorResult(`upload payload exceeds the ${MAX_INLINE_FILE_BYTES / 1024}KB inline limit — use a smaller file.`);
            }
            let uploadPath = path;
            let fileName = input.fileName;
            if (fileName === undefined) {
                fileName = posix.basename(path);
                if (!path.includes('/') || path.endsWith('/') || fileName === '' || fileName === '.' || fileName === '..') {
                    return asErrorResult('upload path must include a directory and filename, must not end with "/", and the filename must not be empty, "." or "..". Alternatively, provide fileName and use path as the target directory.');
                }
                uploadPath = posix.dirname(path);
            }
            await ctx.backend.deviceControl.uploadFile(deviceId, {
                path: uploadPath,
                contentBase64,
                fileName,
                contentType: input.contentType,
            });
            return asTextResult({ status: 'uploaded', deviceId, path });
        },
    }),
    operation({
        op: 'download',
        input: { deviceId: MANAGE_FILES_SHARED_FIELDS.deviceId, path: MANAGE_FILES_SHARED_FIELDS.path },
        access: 'read',
        doc: 'Read path as base64 content; oversized results are rejected with the same inline transfer limit.',
        run: async (ctx, input) => {
            const { deviceId, path } = input;

            const result = await ctx.backend.deviceControl.downloadFile(deviceId, path);
            if (result.content.length > MAX_INLINE_BASE64_CHARS) {
                return asErrorResult(`device file at "${path}" exceeds the ${MAX_INLINE_FILE_BYTES / 1024}KB inline transfer limit.`);
            }
            return asTextResult(result);
        },
    }),
    operation({
        op: 'delete',
        input: { deviceId: MANAGE_FILES_SHARED_FIELDS.deviceId, path: MANAGE_FILES_SHARED_FIELDS.path },
        access: 'write',
        destructive: true,
        doc: 'Delete path.',
        run: async (ctx, input) => {
            const { deviceId, path } = input;

            await ctx.backend.deviceControl.deleteFile(deviceId, path);
            return asTextResult({ status: 'deleted', deviceId, path });
        },
    }),
] as const;
