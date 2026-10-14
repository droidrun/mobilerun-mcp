import {
    type Operation,
    operationValues,
    selectInput,
    operationInput,
    operationDescription,
    runOperation,
} from './operation-table.js';
import { requireValue } from './op-helpers.js';
// apps bundle. Upload is a 3-step flow: (1) create_upload_url returns
// pre-signed object-storage PUT URLs per file — the actual file bytes are
// PUT directly to those URLs by the caller, OUTSIDE this MCP tool (binary
// payloads never travel through MCP JSON as base64); (2) the caller PUTs the
// APK bytes to each upload URL; (3) confirm_upload(id) verifies the file
// landed in storage and flips the app to `available` — or mark_failed(id) if
// the PUT failed/was abandoned.
//
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const appFileSchema = z.object({
    fileName: z.string().min(1),
    contentType: z.enum(['application/vnd.android.package-archive', 'application/octet-stream', 'application/zip']),
    sha256: z.string().optional(),
});
const APPS_INPUT_FIELDS = {
    id: z.string().uuid().optional(),
    query: z.string().optional().describe('Search filter for operation=list.'),
    platform: z.enum(['all', 'android', 'ios']).optional().describe('Filter for operation=list.'),
    status: z
        .enum(['all', 'queued', 'available', 'failed', 'pruned'])
        .optional()
        .describe('Filter for operation=list.'),
    sortBy: z.enum(['createdAt', 'name']).optional(),
    order: z.enum(['asc', 'desc']).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(100).optional(),
    bundleId: z.string().optional().describe('Required for operation=create_upload_url.'),
    displayName: z.string().optional().describe('Required for operation=create_upload_url.'),
    versionCode: z.number().int().optional().describe('Required for operation=create_upload_url.'),
    versionName: z.string().optional().describe('Required for operation=create_upload_url.'),
    sizeBytes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Total upload size in bytes. Required for operation=create_upload_url.'),
    files: z.array(appFileSchema).min(1).optional().describe('Required for operation=create_upload_url.'),
    uploadPlatform: z.enum(['android', 'ios']).optional().describe('App platform for operation=create_upload_url.'),
    country: z
        .string()
        .optional()
        .describe('Country code for search results. Optional for operation=create_upload_url.'),
    description: z.string().optional(),
    developerName: z.string().optional(),
    iconURL: z.string().url().optional(),
    targetSdk: z.number().int().optional(),
};
type AppsInput = z.infer<z.ZodObject<typeof APPS_INPUT_FIELDS>> & {
    operation: string;
};
export const APPS_TABLE = [
    {
        op: 'list',
        input: selectInput(APPS_INPUT_FIELDS, ['query', 'platform', 'status', 'sortBy', 'order', 'page', 'pageSize']),
        access: 'read',
        describe: { order: 1, text: 'list, ' },
        run: async (ctx, input) => {
            const backend = ctx.backend.apps;
            return backend.listApps({
                query: input.query,
                platform: input.platform,
                status: input.status,
                sortBy: input.sortBy,
                order: input.order,
                page: input.page,
                pageSize: input.pageSize,
            });
        },
    },
    {
        op: 'get',
        input: selectInput(APPS_INPUT_FIELDS, ['id']),
        access: 'read',
        describe: { order: 2, text: 'get, versions (all versions visible to the user), ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.apps;
            const id = requireValue(input.id, 'id', operation, 'apps');
            return backend.getApp(id);
        },
    },
    {
        op: 'versions',
        input: selectInput(APPS_INPUT_FIELDS, ['id']),
        access: 'read',
        describe: { order: 0, text: 'Manage uploaded apps (APKs) and inspect versions. Operations: ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.apps;
            const id = requireValue(input.id, 'id', operation, 'apps');
            return backend.listAppVersions(id);
        },
    },
    {
        op: 'create_upload_url',
        input: selectInput(APPS_INPUT_FIELDS, [
            'bundleId',
            'displayName',
            'versionCode',
            'versionName',
            'sizeBytes',
            'files',
            'uploadPlatform',
            'country',
            'description',
            'developerName',
            'iconURL',
            'targetSdk',
        ]),
        access: 'write',
        describe: {
            order: 3,
            text: 'create_upload_url (starts the 3-step upload flow: returns pre-signed upload URLs per file — PUT the raw file bytes to those URLs yourself, outside this tool, then call ',
        },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.apps;
            return backend.createAppUploadUrl({
                bundleId: requireValue(input.bundleId, 'bundleId', operation, 'apps'),
                displayName: requireValue(input.displayName, 'displayName', operation, 'apps'),
                versionCode: requireValue(input.versionCode, 'versionCode', operation, 'apps'),
                versionName: requireValue(input.versionName, 'versionName', operation, 'apps'),
                sizeBytes: requireValue(input.sizeBytes, 'sizeBytes', operation, 'apps'),
                files: requireValue(input.files, 'files', operation, 'apps'),
                platform: input.uploadPlatform,
                country: input.country,
                description: input.description,
                developerName: input.developerName,
                iconURL: input.iconURL,
                targetSdk: input.targetSdk,
            });
        },
    },
    {
        op: 'confirm_upload',
        input: selectInput(APPS_INPUT_FIELDS, ['id']),
        access: 'write',
        describe: { order: 4, text: 'confirm_upload; call ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.apps;
            const id = requireValue(input.id, 'id', operation, 'apps');
            return backend.confirmAppUpload(id);
        },
    },
    {
        op: 'mark_failed',
        input: selectInput(APPS_INPUT_FIELDS, ['id']),
        access: 'write',
        describe: {
            order: 5,
            text: 'mark_failed instead if the PUT fails or is abandoned), confirm_upload, mark_failed, ',
        },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.apps;
            const id = requireValue(input.id, 'id', operation, 'apps');
            return backend.markAppUploadFailed(id);
        },
    },
    {
        op: 'delete',
        input: selectInput(APPS_INPUT_FIELDS, ['id']),
        access: 'write',
        describe: { order: 6, text: 'delete. Additional operations: ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.apps;
            const id = requireValue(input.id, 'id', operation, 'apps');
            return backend.deleteApp(id);
        },
    },
    {
        op: 'storage_usage',
        input: selectInput(APPS_INPUT_FIELDS, []),
        access: 'read',
        describe: { order: 7, text: 'storage_usage: Read app storage usage.' },
        run: async (ctx, input) => {
            return ctx.backend.apps.appsStorageUsage();
        },
    },
] as const satisfies readonly Operation<AppsInput>[];
const APPS_OPERATIONS = operationValues(APPS_TABLE);

export function registerAppsTools(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(APPS_OPERATIONS, ctx.policy.operationAllowlist?.get('apps'));
    server.registerTool(
        'apps',
        {
            description: operationDescription(APPS_TABLE) + allowedValuesNote(operationValues, APPS_OPERATIONS),
            inputSchema: { operation: z.enum(APPS_OPERATIONS), ...operationInput(APPS_TABLE, APPS_INPUT_FIELDS) },
        },
        async (input) => asTextResult(await runOperation(APPS_TABLE, input.operation, ctx, input)),
    );
}
