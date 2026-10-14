import {
    type Operation,
    operationValues,
    selectInput,
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
const FILES_INPUT_FIELDS = {
    zone: filesListSchema.shape.zone,
    fileId: z.string().optional().describe('Required for update/delete/cancel_pending/confirm/download.'),
    displayName: z.union([z.string(), z.null()]).optional(),
    enabled: z.boolean().optional(),
    filename: z.string().optional().describe('Required for upload_url.'),
    mimeType: z.string().optional().describe('Required for upload_url.'),
    sizeBytes: z.number().optional().describe('Required for upload_url.'),
};
type FilesInput = z.infer<z.ZodObject<typeof FILES_INPUT_FIELDS>> & {
    operation: string;
};
export const FILES_TABLE = [
    {
        op: 'download',
        input: selectInput(FILES_INPUT_FIELDS, [...Object.keys(filesDownloadSchema.shape)]),
        readonly: true,
        billed: false,
        describe: { order: 6, text: 'download: Read a short-lived signed download URL.' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesDownload(filesDownloadSchema.strip().parse(input)));
        },
    },
    {
        op: 'list',
        input: selectInput(FILES_INPUT_FIELDS, [...Object.keys(filesListSchema.shape)]),
        readonly: true,
        billed: false,
        describe: { order: 0, text: 'list: List organization files. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesList(filesListSchema.strip().parse(input)));
        },
    },
    {
        op: 'update',
        input: selectInput(FILES_INPUT_FIELDS, [...Object.keys(filesUpdateSchema.shape)]),
        readonly: false,
        billed: false,
        describe: { order: 1, text: 'update: Update file metadata. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesUpdate(filesUpdateSchema.strip().parse(input)));
        },
    },
    {
        op: 'delete',
        input: selectInput(FILES_INPUT_FIELDS, [...Object.keys(filesDeleteSchema.shape)]),
        readonly: false,
        billed: false,
        describe: { order: 2, text: 'delete: Delete a file. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesDelete(filesDeleteSchema.strip().parse(input)));
        },
    },
    {
        op: 'cancel_pending',
        input: selectInput(FILES_INPUT_FIELDS, [...Object.keys(filesCancelPendingSchema.shape)]),
        readonly: false,
        billed: false,
        describe: { order: 3, text: 'cancel_pending: Cancel a pending file upload. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesCancelPending(filesCancelPendingSchema.strip().parse(input)));
        },
    },
    {
        op: 'confirm',
        input: selectInput(FILES_INPUT_FIELDS, [...Object.keys(filesConfirmSchema.shape)]),
        readonly: false,
        billed: false,
        describe: { order: 4, text: 'confirm: Confirm an uploaded file. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesConfirm(filesConfirmSchema.strip().parse(input)));
        },
    },
    {
        op: 'upload_url',
        input: selectInput(FILES_INPUT_FIELDS, [...Object.keys(filesUploadUrlSchema.shape)]),
        readonly: false,
        billed: false,
        describe: {
            order: 5,
            text: 'upload_url: Create a signed upload URL; upload bytes to the URL outside this tool. ',
        },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.files;
            return asTextResult(await backend.filesUploadUrl(filesUploadUrlSchema.strip().parse(input)));
        },
    },
] as const satisfies readonly Operation<FilesInput>[];
const FILES_OPERATIONS = operationValues(FILES_TABLE);
export function registerFilesTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(FILES_OPERATIONS, ctx.policy.operationAllowlist?.get('files'));
    server.registerTool(
        'files',
        {
            description: operationDescription(FILES_TABLE) + allowedValuesNote(values, FILES_OPERATIONS),
            inputSchema: { operation: z.enum(FILES_OPERATIONS), ...operationInput(FILES_TABLE, FILES_INPUT_FIELDS) },
        },
        async (input) => runOperation(FILES_TABLE, input.operation, ctx, input),
    );
}
