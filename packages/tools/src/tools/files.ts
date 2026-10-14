import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
    filesCancelPendingSchema,
    filesConfirmSchema,
    filesDeleteSchema,
    filesDownloadSchema,
    filesListSchema,
    filesUpdateSchema,
    filesUploadUrlSchema,
} from '../backend/files.js';
import { type ToolCtx } from '../ctx.js';
import { registerBundle, sdkOp } from './operation-table.js';
const FILES_SHARED_FIELDS = {
    zone: filesListSchema.shape.zone,
    fileId: z.string().optional().describe('Required for update/delete/cancel_pending/confirm/download.'),
    filename: z.string().optional().describe('Required for upload_url.'),
    mimeType: z.string().optional().describe('Required for upload_url.'),
    sizeBytes: z.number().optional().describe('Required for upload_url.'),
};

const FILES_INTRO = 'Manage organization files and signed transfer URLs.';
export const FILES_TABLE = [
    sdkOp('download', filesDownloadSchema, (ctx, params) => ctx.backend.files.filesDownload(params), 'read', {
        doc: 'Read a short-lived signed download URL.',
    }),
    sdkOp('list', filesListSchema, (ctx, params) => ctx.backend.files.filesList(params), 'read', {
        doc: 'List organization files.',
    }),
    sdkOp('update', filesUpdateSchema, (ctx, params) => ctx.backend.files.filesUpdate(params), 'write', {
        doc: 'Update file metadata.',
    }),
    sdkOp('delete', filesDeleteSchema, (ctx, params) => ctx.backend.files.filesDelete(params), 'write', {
        doc: 'Delete a file.',
    }),
    sdkOp('cancel_pending', filesCancelPendingSchema, (ctx, params) => ctx.backend.files.filesCancelPending(params), 'write', {
        doc: 'Cancel a pending file upload.',
    }),
    sdkOp('confirm', filesConfirmSchema, (ctx, params) => ctx.backend.files.filesConfirm(params), 'write', {
        doc: 'Confirm an uploaded file.',
    }),
    sdkOp('upload_url', filesUploadUrlSchema, (ctx, params) => ctx.backend.files.filesUploadUrl(params), 'write', {
        doc: 'Create a signed upload URL; upload bytes to the URL outside this tool.',
    }),
] as const;

export function registerFilesTools(server: McpServer, ctx: ToolCtx): void {
    registerBundle(server, ctx, 'files', FILES_TABLE, { intro: FILES_INTRO, shared: FILES_SHARED_FIELDS });
}
