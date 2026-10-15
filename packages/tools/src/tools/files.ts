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

const FILES_OPERATIONS = [
    'download',
    'list',
    'update',
    'delete',
    'cancel_pending',
    'confirm',
    'upload_url',
] as const;

export function registerFilesTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(FILES_OPERATIONS, ctx.policy.operationAllowlist?.get('files'));
    server.registerTool(
        'files',
        {
            description:
                'list: List organization files. update: Update file metadata. delete: Delete a file. cancel_pending: Cancel a pending file upload. confirm: Confirm an uploaded file. upload_url: Create a signed upload URL; upload bytes to the URL outside this tool.' +
                ' download: Read a short-lived signed download URL.' +
                allowedValuesNote(values, FILES_OPERATIONS),
            inputSchema: {
                operation: z.enum(FILES_OPERATIONS),
                zone: filesListSchema.shape.zone,
                fileId: z.string().optional().describe('Required for update/delete/cancel_pending/confirm/download.'),
                displayName: z.union([z.string(), z.null()]).optional(),
                enabled: z.boolean().optional(),
                filename: z.string().optional().describe('Required for upload_url.'),
                mimeType: z.string().optional().describe('Required for upload_url.'),
                sizeBytes: z.number().optional().describe('Required for upload_url.'),
            },
        },
        async ({ operation, ...input }) => {
            const backend = ctx.backend.files;
            switch (operation) {
                case 'download':
                    return asTextResult(await backend.filesDownload(filesDownloadSchema.strip().parse(input)));
                case 'list':
                    return asTextResult(await backend.filesList(filesListSchema.strip().parse(input)));
                case 'update':
                    return asTextResult(await backend.filesUpdate(filesUpdateSchema.strip().parse(input)));
                case 'delete':
                    return asTextResult(await backend.filesDelete(filesDeleteSchema.strip().parse(input)));
                case 'cancel_pending':
                    return asTextResult(
                        await backend.filesCancelPending(filesCancelPendingSchema.strip().parse(input)),
                    );
                case 'confirm':
                    return asTextResult(await backend.filesConfirm(filesConfirmSchema.strip().parse(input)));
                case 'upload_url':
                    return asTextResult(await backend.filesUploadUrl(filesUploadUrlSchema.strip().parse(input)));
            }
        },
    );
}
