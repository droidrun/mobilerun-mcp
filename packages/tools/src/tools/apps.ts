// apps bundle. Upload is a 3-step flow: (1) create_upload_url returns
// pre-signed object-storage PUT URLs per file — the actual file bytes are
// PUT directly to those URLs by the caller, OUTSIDE this MCP tool (binary
// payloads never travel through MCP JSON as base64); (2) the caller PUTs the
// APK bytes to each upload URL; (3) confirm_upload(id) verifies the file
// landed in storage and flips the app to `available` — or mark_failed(id) if
// the PUT failed/was abandoned.
//
// GAP: a `storage-usage` endpoint was originally planned for this bundle;
// @mobilerun/sdk 5.1.0 has no such method on `client.apps` (verified
// against apps.d.ts) — dropped, see backend/apps.ts's file header.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

const APPS_OPERATIONS = ['list', 'get', 'versions', 'create_upload_url', 'confirm_upload', 'mark_failed', 'delete'] as const;
const appsOperationSchema = z.enum(APPS_OPERATIONS);

const appFileSchema = z.object({
    fileName: z.string().min(1),
    contentType: z.enum(['application/vnd.android.package-archive', 'application/octet-stream', 'application/zip']),
    sha256: z.string().optional(),
});

type AppsToolInput = {
    operation: z.infer<typeof appsOperationSchema>;
    id?: string;
    query?: string;
    platform?: 'all' | 'android' | 'ios';
    status?: 'all' | 'queued' | 'available' | 'failed';
    sortBy?: 'createdAt' | 'name';
    order?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    bundleId?: string;
    displayName?: string;
    versionCode?: number;
    versionName?: string;
    sizeBytes?: number;
    files?: z.infer<typeof appFileSchema>[];
    uploadPlatform?: 'android' | 'ios';
    country?: string;
    description?: string;
    developerName?: string;
    iconURL?: string;
    targetSdk?: number;
};

function requireValue<T>(value: T | undefined, name: string, operation: string): T {
    if (value === undefined) throw new Error(`apps operation=${operation} requires ${name}`);
    return value;
}

export async function executeAppsOperation(input: AppsToolInput, ctx: ToolCtx): Promise<unknown> {
    const { operation } = input;
    const backend = ctx.backend.apps;

    if (operation === 'list') {
        return backend.listApps({
            query: input.query,
            platform: input.platform,
            status: input.status,
            sortBy: input.sortBy,
            order: input.order,
            page: input.page,
            pageSize: input.pageSize,
        });
    }

    if (operation === 'create_upload_url') {
        return backend.createAppUploadUrl({
            bundleId: requireValue(input.bundleId, 'bundleId', operation),
            displayName: requireValue(input.displayName, 'displayName', operation),
            versionCode: requireValue(input.versionCode, 'versionCode', operation),
            versionName: requireValue(input.versionName, 'versionName', operation),
            sizeBytes: requireValue(input.sizeBytes, 'sizeBytes', operation),
            files: requireValue(input.files, 'files', operation),
            platform: input.uploadPlatform,
            country: input.country,
            description: input.description,
            developerName: input.developerName,
            iconURL: input.iconURL,
            targetSdk: input.targetSdk,
        });
    }

    const id = requireValue(input.id, 'id', operation);
    if (operation === 'get') return backend.getApp(id);
    if (operation === 'versions') return backend.listAppVersions(id);
    if (operation === 'confirm_upload') return backend.confirmAppUpload(id);
    if (operation === 'mark_failed') return backend.markAppUploadFailed(id);
    return backend.deleteApp(id);
}

export function registerAppsTools(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(APPS_OPERATIONS, ctx.policy.operationAllowlist?.get('apps'));

    server.registerTool(
        'apps',
        {
            description:
                'Manage uploaded apps (APKs) and inspect versions. Operations: list, get, versions (all versions visible to the ' +
                'user), create_upload_url (starts the 3-step upload flow: returns pre-signed R2 PUT URLs per file — PUT the raw ' +
                'file bytes to those URLs yourself, outside this tool, then call confirm_upload; call mark_failed instead if the ' +
                'PUT fails or is abandoned), confirm_upload, mark_failed, delete.' +
                allowedValuesNote(operationValues, APPS_OPERATIONS),
            inputSchema: {
                operation: appsOperationSchema,
                id: z.string().uuid().optional(),
                query: z.string().optional().describe('Search filter for operation=list.'),
                platform: z.enum(['all', 'android', 'ios']).optional().describe('Filter for operation=list.'),
                status: z.enum(['all', 'queued', 'available', 'failed']).optional().describe('Filter for operation=list.'),
                sortBy: z.enum(['createdAt', 'name']).optional(),
                order: z.enum(['asc', 'desc']).optional(),
                page: z.number().int().positive().optional(),
                pageSize: z.number().int().positive().max(100).optional(),
                bundleId: z.string().optional().describe('Required for operation=create_upload_url.'),
                displayName: z.string().optional().describe('Required for operation=create_upload_url.'),
                versionCode: z.number().int().optional().describe('Required for operation=create_upload_url.'),
                versionName: z.string().optional().describe('Required for operation=create_upload_url.'),
                sizeBytes: z.number().int().positive().optional().describe('Total upload size in bytes. Required for operation=create_upload_url.'),
                files: z.array(appFileSchema).min(1).optional().describe('Required for operation=create_upload_url.'),
                uploadPlatform: z.enum(['android', 'ios']).optional().describe('App platform for operation=create_upload_url.'),
                country: z.string().optional().describe('Country code for search results. Optional for operation=create_upload_url.'),
                description: z.string().optional(),
                developerName: z.string().optional(),
                iconURL: z.string().url().optional(),
                targetSdk: z.number().int().optional(),
            },
        },
        async (input) => asTextResult(await executeAppsOperation(input as AppsToolInput, ctx)),
    );
}
