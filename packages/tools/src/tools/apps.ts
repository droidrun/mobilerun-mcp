import { operation, registerBundle, requireValue, sdkOp } from './operation-table.js';
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
const appFileSchema = z.object({
    fileName: z.string().min(1),
    contentType: z.enum(['application/vnd.android.package-archive', 'application/octet-stream', 'application/zip']),
    sha256: z.string().optional(),
});
const APPS_SHARED_FIELDS = {
    id: z.string().uuid().optional(),
};

const APPS_INTRO = 'Manage uploaded apps (APKs) and inspect versions.';
export const APPS_TABLE = [
    operation({
        op: 'list',
        input: {
            query: z.string().optional().describe('Search filter for operation=list.'),
            platform: z.enum(['all', 'android', 'ios']).optional().describe('Filter for operation=list.'),
            status: z.enum(['all', 'queued', 'available', 'failed', 'pruned']).optional().describe('Filter for operation=list.'),
            sortBy: z.enum(['createdAt', 'name']).optional(),
            order: z.enum(['asc', 'desc']).optional(),
            page: z.number().int().positive().optional(),
            pageSize: z.number().int().positive().max(100).optional(),
        },
        access: 'read',
        doc: 'List uploaded apps with optional filters.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.apps.listApps({
                    query: input.query,
                    platform: input.platform,
                    status: input.status,
                    sortBy: input.sortBy,
                    order: input.order,
                    page: input.page,
                    pageSize: input.pageSize,
                }),
            ),
    }),
    operation({
        op: 'get',
        input: { id: APPS_SHARED_FIELDS.id },
        access: 'read',
        doc: 'Read an uploaded app.',
        run: async (ctx, input) => asTextResult(await ctx.backend.apps.getApp(requireValue(input.id, 'id', input.operation, 'apps'))),
    }),
    operation({
        op: 'versions',
        input: { id: APPS_SHARED_FIELDS.id },
        access: 'read',
        doc: 'Read all versions visible to the user.',
        run: async (ctx, input) =>
            asTextResult(await ctx.backend.apps.listAppVersions(requireValue(input.id, 'id', input.operation, 'apps'))),
    }),
    operation({
        op: 'create_upload_url',
        input: {
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
            country: z.string().optional().describe('Country code for search results. Optional for operation=create_upload_url.'),
            description: z.string().optional(),
            developerName: z.string().optional(),
            iconURL: z.string().url().optional(),
            targetSdk: z.number().int().optional(),
        },
        access: 'write',
        doc: 'Start the 3-step upload flow: return pre-signed upload URLs per file. PUT the raw file bytes to those URLs yourself, outside this tool, then call confirm_upload; call mark_failed instead if the PUT fails or is abandoned.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.apps.createAppUploadUrl({
                    bundleId: requireValue(input.bundleId, 'bundleId', input.operation, 'apps'),
                    displayName: requireValue(input.displayName, 'displayName', input.operation, 'apps'),
                    versionCode: requireValue(input.versionCode, 'versionCode', input.operation, 'apps'),
                    versionName: requireValue(input.versionName, 'versionName', input.operation, 'apps'),
                    sizeBytes: requireValue(input.sizeBytes, 'sizeBytes', input.operation, 'apps'),
                    files: requireValue(input.files, 'files', input.operation, 'apps'),
                    platform: input.uploadPlatform,
                    country: input.country,
                    description: input.description,
                    developerName: input.developerName,
                    iconURL: input.iconURL,
                    targetSdk: input.targetSdk,
                }),
            ),
    }),
    operation({
        op: 'confirm_upload',
        input: { id: APPS_SHARED_FIELDS.id },
        access: 'write',
        doc: 'Confirm that the uploaded file arrived.',
        run: async (ctx, input) =>
            asTextResult(await ctx.backend.apps.confirmAppUpload(requireValue(input.id, 'id', input.operation, 'apps'))),
    }),
    operation({
        op: 'mark_failed',
        input: { id: APPS_SHARED_FIELDS.id },
        access: 'write',
        doc: 'Mark a failed or abandoned upload.',
        run: async (ctx, input) =>
            asTextResult(await ctx.backend.apps.markAppUploadFailed(requireValue(input.id, 'id', input.operation, 'apps'))),
    }),
    operation({
        op: 'delete',
        input: { id: APPS_SHARED_FIELDS.id },
        access: 'write',
        destructive: true,
        doc: 'Delete an uploaded app.',
        run: async (ctx, input) => asTextResult(await ctx.backend.apps.deleteApp(requireValue(input.id, 'id', input.operation, 'apps'))),
    }),
    sdkOp('storage_usage', z.object({}), (ctx) => ctx.backend.apps.appsStorageUsage(), 'read', {
        doc: 'Read app storage usage.',
    }),
] as const;

export function registerAppsTools(server: McpServer, ctx: ToolCtx): void {
    registerBundle(server, ctx, 'apps', APPS_TABLE, { intro: APPS_INTRO, shared: APPS_SHARED_FIELDS });
}
