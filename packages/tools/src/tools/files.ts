import {
    operation,
    sdkOp,
    operationValues,
    operationInput,
    operationDescription,
    runOperation, registerBundle } from './operation-table.js';
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
    sdkOp('download', filesDownloadSchema, (ctx, params) => ctx.backend.files.filesDownload(params), 'read', { describe: { order: 6, text: 'download: Read a short-lived signed download URL.' } }),
    sdkOp('list', filesListSchema, (ctx, params) => ctx.backend.files.filesList(params), 'read', { describe: { order: 0, text: 'list: List organization files. ' } }),
    sdkOp('update', filesUpdateSchema, (ctx, params) => ctx.backend.files.filesUpdate(params), 'write', { describe: { order: 1, text: 'update: Update file metadata. ' } }),
    sdkOp('delete', filesDeleteSchema, (ctx, params) => ctx.backend.files.filesDelete(params), 'write', { describe: { order: 2, text: 'delete: Delete a file. ' } }),
    sdkOp('cancel_pending', filesCancelPendingSchema, (ctx, params) => ctx.backend.files.filesCancelPending(params), 'write', { describe: { order: 3, text: 'cancel_pending: Cancel a pending file upload. ' } }),
    sdkOp('confirm', filesConfirmSchema, (ctx, params) => ctx.backend.files.filesConfirm(params), 'write', { describe: { order: 4, text: 'confirm: Confirm an uploaded file. ' } }),
    sdkOp('upload_url', filesUploadUrlSchema, (ctx, params) => ctx.backend.files.filesUploadUrl(params), 'write', { describe: {
            order: 5,
            text: 'upload_url: Create a signed upload URL; upload bytes to the URL outside this tool. ',
        } }),
] as const;

export function registerFilesTools(server: McpServer, ctx: ToolCtx): void {
    
    registerBundle(server, ctx, 'files', FILES_TABLE, { shared: FILES_SHARED_FIELDS });
}
