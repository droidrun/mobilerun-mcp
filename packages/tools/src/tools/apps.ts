import {
    operation,
    sdkOp,
    operationValues,
    operationInput,
    operationDescription,
    runOperation, registerBundle } from './operation-table.js';
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
const APPS_SHARED_FIELDS = {
    id: z.string().uuid().optional(),
};

export const APPS_TABLE = [
    operation({
        op: 'list',
        input: { query: z.string().optional().describe('Search filter for operation=list.'), platform: z.enum(['all', 'android', 'ios']).optional().describe('Filter for operation=list.'), status: z
        .enum(['all', 'queued', 'available', 'failed', 'pruned'])
        .optional()
        .describe('Filter for operation=list.'), sortBy: z.enum(['createdAt', 'name']).optional(), order: z.enum(['asc', 'desc']).optional(), page: z.number().int().positive().optional(), pageSize: z.number().int().positive().max(100).optional() },
        access: 'read',
        describe: { order: 1, text: 'list, ' },
        run: async (ctx, input) => {
            const backend = ctx.backend.apps;
            return asTextResult(await backend.listApps({
                query: input.query,
                platform: input.platform,
                status: input.status,
                sortBy: input.sortBy,
                order: input.order,
                page: input.page,
                pageSize: input.pageSize,
            }));
        },
    }),
    operation({
        op: 'get',
        input: { id: APPS_SHARED_FIELDS.id },
        access: 'read',
        describe: { order: 2, text: 'get, versions (all versions visible to the user), ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.apps;
            const id = requireValue(input.id, 'id', operation, 'apps');
            return asTextResult(await backend.getApp(id));
        },
    }),
    operation({
        op: 'versions',
        input: { id: APPS_SHARED_FIELDS.id },
        access: 'read',
        describe: { order: 0, text: 'Manage uploaded apps (APKs) and inspect versions. Operations: ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.apps;
            const id = requireValue(input.id, 'id', operation, 'apps');
            return asTextResult(await backend.listAppVersions(id));
        },
    }),
    operation({
        op: 'create_upload_url',
        input: { bundleId: z.string().optional().describe('Required for operation=create_upload_url.'), displayName: z.string().optional().describe('Required for operation=create_upload_url.'), versionCode: z.number().int().optional().describe('Required for operation=create_upload_url.'), versionName: z.string().optional().describe('Required for operation=create_upload_url.'), sizeBytes: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Total upload size in bytes. Required for operation=create_upload_url.'), files: z.array(appFileSchema).min(1).optional().describe('Required for operation=create_upload_url.'), uploadPlatform: z.enum(['android', 'ios']).optional().describe('App platform for operation=create_upload_url.'), country: z
        .string()
        .optional()
        .describe('Country code for search results. Optional for operation=create_upload_url.'), description: z.string().optional(), developerName: z.string().optional(), iconURL: z.string().url().optional(), targetSdk: z.number().int().optional() },
        access: 'write',
        describe: {
            order: 3,
            text: 'create_upload_url (starts the 3-step upload flow: returns pre-signed upload URLs per file — PUT the raw file bytes to those URLs yourself, outside this tool, then call ',
        },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.apps;
            return asTextResult(await backend.createAppUploadUrl({
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
            }));
        },
    }),
    operation({
        op: 'confirm_upload',
        input: { id: APPS_SHARED_FIELDS.id },
        access: 'write',
        describe: { order: 4, text: 'confirm_upload; call ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.apps;
            const id = requireValue(input.id, 'id', operation, 'apps');
            return asTextResult(await backend.confirmAppUpload(id));
        },
    }),
    operation({
        op: 'mark_failed',
        input: { id: APPS_SHARED_FIELDS.id },
        access: 'write',
        describe: {
            order: 5,
            text: 'mark_failed instead if the PUT fails or is abandoned), confirm_upload, mark_failed, ',
        },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.apps;
            const id = requireValue(input.id, 'id', operation, 'apps');
            return asTextResult(await backend.markAppUploadFailed(id));
        },
    }),
    operation({
        op: 'delete',
        input: { id: APPS_SHARED_FIELDS.id },
        access: 'write',
        describe: { order: 6, text: 'delete. Additional operations: ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.apps;
            const id = requireValue(input.id, 'id', operation, 'apps');
            return asTextResult(await backend.deleteApp(id));
        },
    }),
    sdkOp('storage_usage', z.object({}), (ctx, params) => ctx.backend.apps.appsStorageUsage(), 'read', { describe: { order: 7, text: 'storage_usage: Read app storage usage.' } }),
] as const;


export function registerAppsTools(server: McpServer, ctx: ToolCtx): void {
    
    registerBundle(server, ctx, 'apps', APPS_TABLE, { shared: APPS_SHARED_FIELDS });
}
