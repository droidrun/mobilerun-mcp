import { operation, registerBundle, requireValue, sdkOp } from './operation-table.js';
// Credentials read and mutation tools use separate policy operation gates.
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { manageCredentialsGetSchema } from '../backend/credentials.js';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
export function registerCredentialTools(server: McpServer, ctx: ToolCtx): void {
    server.registerTool(
        'list_credentials',
        {
            description:
                "List the user's saved credentials (metadata only — values never leave credentials storage). Optional `packageName` filter scopes to one app.",
            inputSchema: {
                packageName: z.string().optional(),
            },
        },
        async ({ packageName }) => asTextResult(await ctx.backend.credentials.listCredentials(packageName)),
    );
    server.registerTool(
        'list_credential_packages',
        {
            description: 'List app packages that have any credential configured. Each entry is `{ packageName }`.',
            inputSchema: {},
        },
        async () => asTextResult(await ctx.backend.credentials.listCredentialPackages()),
    );
}
// --- manage_credentials (write path) -----------------------------------
// Kept as a separate tool/registration function from the read path above: this
// package also offers metadata retrieval under the bundle's get operation.
// SECRETS: every operation is a write that may carry a plaintext `value`
// as INPUT (the field being set); the response never echoes it back — see
// backend/credentials.ts's CredentialMetaDto (fieldType only, no `value`
// field in the type at all, so there is nothing to redact here).
const fieldTypeSchema = z.enum(['email', 'username', 'password', 'api_token', 'phone_number', 'two_factor_secret', 'backup_codes']);
const MANAGE_CREDENTIALS_SHARED_FIELDS = {
    packageName: z.string().min(1).max(256).optional(),
    credentialName: z.string().min(1).max(256).optional(),
    fieldType: fieldTypeSchema.optional(),
    value: z.string().min(1).max(4096).optional(),
};

const MANAGE_CREDENTIALS_INTRO =
    'Manage the credentials vault; list_credentials and list_credential_packages provide reads. Field values are write-only: every response returns metadata only (fieldType, never the plaintext value). Keep the value you sent yourself if you need it again.';
export const MANAGE_CREDENTIALS_TABLE = [
    operation({
        op: 'init_package',
        input: { packageName: MANAGE_CREDENTIALS_SHARED_FIELDS.packageName },
        access: 'write',
        doc: 'Create a new app package before its first credential (packageName).',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.credentials.initPackage({
                    packageName: requireValue(input.packageName, 'packageName', input.operation, 'manage_credentials'),
                }),
            ),
    }),
    operation({
        op: 'create_credential',
        input: {
            packageName: MANAGE_CREDENTIALS_SHARED_FIELDS.packageName,
            credentialName: MANAGE_CREDENTIALS_SHARED_FIELDS.credentialName,
            fields: z
                .array(z.object({ fieldType: fieldTypeSchema, value: z.string().min(1).max(4096) }))
                .min(1)
                .optional(),
        },
        access: 'write',
        doc: 'Create a credential (packageName, credentialName, fields[{fieldType, value}]).',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.credentials.createCredential({
                    packageName: requireValue(input.packageName, 'packageName', input.operation, 'manage_credentials'),
                    credentialName: requireValue(input.credentialName, 'credentialName', input.operation, 'manage_credentials'),
                    fields: requireValue(input.fields, 'fields', input.operation, 'manage_credentials'),
                }),
            ),
    }),
    operation({
        op: 'delete_credential',
        input: {
            packageName: MANAGE_CREDENTIALS_SHARED_FIELDS.packageName,
            credentialName: MANAGE_CREDENTIALS_SHARED_FIELDS.credentialName,
        },
        access: 'write',
        destructive: true,
        doc: 'Delete a credential (packageName, credentialName).',
        run: async (ctx, input) => {
            const packageName = requireValue(input.packageName, 'packageName', input.operation, 'manage_credentials');
            const credentialName = requireValue(input.credentialName, 'credentialName', input.operation, 'manage_credentials');
            return asTextResult(await ctx.backend.credentials.deleteCredential({ packageName, credentialName }));
        },
    }),
    operation({
        op: 'add_field',
        input: {
            packageName: MANAGE_CREDENTIALS_SHARED_FIELDS.packageName,
            credentialName: MANAGE_CREDENTIALS_SHARED_FIELDS.credentialName,
            fieldType: MANAGE_CREDENTIALS_SHARED_FIELDS.fieldType,
            value: MANAGE_CREDENTIALS_SHARED_FIELDS.value,
        },
        access: 'write',
        doc: 'Add a field (packageName, credentialName, fieldType, value).',
        run: async (ctx, input) => {
            const packageName = requireValue(input.packageName, 'packageName', input.operation, 'manage_credentials');
            const credentialName = requireValue(input.credentialName, 'credentialName', input.operation, 'manage_credentials');
            const fieldType = requireValue(input.fieldType, 'fieldType', input.operation, 'manage_credentials');
            return asTextResult(
                await ctx.backend.credentials.addField({
                    packageName,
                    credentialName,
                    fieldType,
                    value: requireValue(input.value, 'value', input.operation, 'manage_credentials'),
                }),
            );
        },
    }),
    operation({
        op: 'update_field',
        input: {
            packageName: MANAGE_CREDENTIALS_SHARED_FIELDS.packageName,
            credentialName: MANAGE_CREDENTIALS_SHARED_FIELDS.credentialName,
            fieldType: MANAGE_CREDENTIALS_SHARED_FIELDS.fieldType,
            value: MANAGE_CREDENTIALS_SHARED_FIELDS.value,
        },
        access: 'write',
        doc: 'Update a field (packageName, credentialName, fieldType, value).',
        run: async (ctx, input) => {
            const packageName = requireValue(input.packageName, 'packageName', input.operation, 'manage_credentials');
            const credentialName = requireValue(input.credentialName, 'credentialName', input.operation, 'manage_credentials');
            const fieldType = requireValue(input.fieldType, 'fieldType', input.operation, 'manage_credentials');
            return asTextResult(
                await ctx.backend.credentials.updateField({
                    packageName,
                    credentialName,
                    fieldType,
                    value: requireValue(input.value, 'value', input.operation, 'manage_credentials'),
                }),
            );
        },
    }),
    operation({
        op: 'delete_field',
        input: {
            packageName: MANAGE_CREDENTIALS_SHARED_FIELDS.packageName,
            credentialName: MANAGE_CREDENTIALS_SHARED_FIELDS.credentialName,
            fieldType: MANAGE_CREDENTIALS_SHARED_FIELDS.fieldType,
        },
        access: 'write',
        destructive: true,
        doc: 'Delete a field (packageName, credentialName, fieldType).',
        run: async (ctx, input) => {
            const packageName = requireValue(input.packageName, 'packageName', input.operation, 'manage_credentials');
            const credentialName = requireValue(input.credentialName, 'credentialName', input.operation, 'manage_credentials');
            const fieldType = requireValue(input.fieldType, 'fieldType', input.operation, 'manage_credentials');
            return asTextResult(await ctx.backend.credentials.deleteField({ packageName, credentialName, fieldType }));
        },
    }),
    sdkOp('get', manageCredentialsGetSchema, (ctx, params) => ctx.backend.credentials.manageCredentialsGet(params), 'read', {
        doc: 'Read credential metadata; secret values stay in storage.',
    }),
] as const;

export function registerManageCredentialsTool(server: McpServer, ctx: ToolCtx): void {
    registerBundle(server, ctx, 'manage_credentials', MANAGE_CREDENTIALS_TABLE, {
        intro: MANAGE_CREDENTIALS_INTRO,
        shared: MANAGE_CREDENTIALS_SHARED_FIELDS,
    });
}
