import {
    operation,
    operationValues,
    operationInput,
    operationDescription,
    runOperation,
} from './operation-table.js';
import {
    filesDownloadSchema,
    filesListSchema,
    filesUpdateSchema,
    filesDeleteSchema,
    filesCancelPendingSchema,
    filesConfirmSchema,
    filesUploadUrlSchema,
} from '../backend/files.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const FILES_SHARED_FIELDS = {
    zone: filesListSchema.shape.zone,
    fileId: z.string().optional().describe('Required for update/delete/cancel_pending/confirm/download.'),
    displayName: z.union([z.string(), z.null()]).optional(),
    enabled: z.boolean().optional(),
    filename: z.string().optional().describe('Required for upload_url.'),
    mimeType: z.string().optional().describe('Required for upload_url.'),
    sizeBytes: z.number().optional().describe('Required for upload_url.'),
};

export const FILES_TABLE = [
    operation({
        op: 'download',
        input: { ...filesDownloadSchema.partial().shape, fileId: FILES_SHARED_FIELDS.fileId },
        access: 'read',
        describe: { order: 6, text: 'download: Read a short-lived signed download URL.' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesDownload(filesDownloadSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'list',
        input: { ...filesListSchema.partial().shape, zone: FILES_SHARED_FIELDS.zone },
        access: 'read',
        describe: { order: 0, text: 'list: List organization files. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesList(filesListSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'update',
        input: { ...filesUpdateSchema.partial().shape, fileId: FILES_SHARED_FIELDS.fileId, displayName: FILES_SHARED_FIELDS.displayName, enabled: FILES_SHARED_FIELDS.enabled },
        access: 'write',
        describe: { order: 1, text: 'update: Update file metadata. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesUpdate(filesUpdateSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'delete',
        input: { ...filesDeleteSchema.partial().shape, fileId: FILES_SHARED_FIELDS.fileId },
        access: 'write',
        describe: { order: 2, text: 'delete: Delete a file. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesDelete(filesDeleteSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'cancel_pending',
        input: { ...filesCancelPendingSchema.partial().shape, fileId: FILES_SHARED_FIELDS.fileId },
        access: 'write',
        describe: { order: 3, text: 'cancel_pending: Cancel a pending file upload. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesCancelPending(filesCancelPendingSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'confirm',
        input: { ...filesConfirmSchema.partial().shape, fileId: FILES_SHARED_FIELDS.fileId },
        access: 'write',
        describe: { order: 4, text: 'confirm: Confirm an uploaded file. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesConfirm(filesConfirmSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'upload_url',
        input: { ...filesUploadUrlSchema.partial().shape, filename: FILES_SHARED_FIELDS.filename, mimeType: FILES_SHARED_FIELDS.mimeType, sizeBytes: FILES_SHARED_FIELDS.sizeBytes, zone: FILES_SHARED_FIELDS.zone },
        access: 'write',
        describe: {
            order: 5,
            text: 'upload_url: Create a signed upload URL; upload bytes to the URL outside this tool. ',
        },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesUploadUrl(filesUploadUrlSchema.strip().parse(input)));
        },
    }),
] as const;
const FILES_OPERATIONS = operationValues(FILES_TABLE);
export function registerFilesTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(FILES_OPERATIONS, ctx.policy.operationAllowlist?.get('files'));
    server.registerTool(
        'files',
        {
            description: operationDescription(FILES_TABLE) + allowedValuesNote(values, FILES_OPERATIONS),
            inputSchema: { operation: z.enum(FILES_OPERATIONS), ...operationInput(FILES_TABLE, FILES_SHARED_FIELDS) },
        },
        async (input) => runOperation(FILES_TABLE, input.operation, ctx, input),
    );
}
