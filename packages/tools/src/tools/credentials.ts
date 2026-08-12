// Credentials read tools. Dispatch goes through Backend.credentials rather
// than a raw fetch with trust headers. See SdkBackend for how
// list_credential_packages is derived — @mobilerun/sdk has no "list all
// packages with credentials" endpoint (only
// credentials.packages.list(packageName), which lists WITHIN one package).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

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
// package never mixes read with mutation under one operation enum.
// SECRETS: every operation is a write that may carry a plaintext `value`
// as INPUT (the field being set); the response never echoes it back — see
// backend/credentials.ts's CredentialMetaDto (fieldType only, no `value`
// field in the type at all, so there is nothing to redact here).

const MANAGE_CREDENTIALS_OPERATIONS = [
    'init_package',
    'create_credential',
    'delete_credential',
    'add_field',
    'update_field',
    'delete_field',
] as const;
const manageCredentialsOperationSchema = z.enum(MANAGE_CREDENTIALS_OPERATIONS);

const fieldTypeSchema = z.enum(['email', 'username', 'password', 'api_token', 'phone_number', 'two_factor_secret', 'backup_codes']);

type ManageCredentialsInput = {
    operation: z.infer<typeof manageCredentialsOperationSchema>;
    packageName?: string;
    credentialName?: string;
    fieldType?: z.infer<typeof fieldTypeSchema>;
    value?: string;
    fields?: Array<{ fieldType: z.infer<typeof fieldTypeSchema>; value: string }>;
};

function requireCredentialValue<T>(value: T | undefined, name: string, operation: string): T {
    if (value === undefined) throw new Error(`manage_credentials operation=${operation} requires ${name}`);
    return value;
}

export async function executeManageCredentialsOperation(input: ManageCredentialsInput, ctx: ToolCtx): Promise<unknown> {
    const { operation } = input;
    const backend = ctx.backend.credentials;

    if (operation === 'init_package') {
        return backend.initPackage({ packageName: requireCredentialValue(input.packageName, 'packageName', operation) });
    }

    const packageName = requireCredentialValue(input.packageName, 'packageName', operation);

    if (operation === 'create_credential') {
        return backend.createCredential({
            packageName,
            credentialName: requireCredentialValue(input.credentialName, 'credentialName', operation),
            fields: requireCredentialValue(input.fields, 'fields', operation),
        });
    }

    const credentialName = requireCredentialValue(input.credentialName, 'credentialName', operation);

    if (operation === 'delete_credential') {
        return backend.deleteCredential({ packageName, credentialName });
    }

    const fieldType = requireCredentialValue(input.fieldType, 'fieldType', operation);

    if (operation === 'add_field') {
        return backend.addField({ packageName, credentialName, fieldType, value: requireCredentialValue(input.value, 'value', operation) });
    }
    if (operation === 'update_field') {
        return backend.updateField({ packageName, credentialName, fieldType, value: requireCredentialValue(input.value, 'value', operation) });
    }
    return backend.deleteField({ packageName, credentialName, fieldType });
}

export function registerManageCredentialsTool(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(MANAGE_CREDENTIALS_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_credentials'));

    server.registerTool(
        'manage_credentials',
        {
            description:
                'Write path for the credentials vault (see list_credentials/list_credential_packages for reads). Operations: ' +
                'init_package (packageName — create a new app package before its first credential), ' +
                'create_credential (packageName, credentialName, fields[{fieldType, value}]), ' +
                'delete_credential (packageName, credentialName), ' +
                'add_field (packageName, credentialName, fieldType, value), ' +
                'update_field (packageName, credentialName, fieldType, value), ' +
                'delete_field (packageName, credentialName, fieldType). ' +
                'Field values are write-only: every response returns metadata only (fieldType, never the plaintext value) — ' +
                'keep the value you sent yourself if you need it again.' +
                allowedValuesNote(operationValues, MANAGE_CREDENTIALS_OPERATIONS),
            inputSchema: {
                operation: manageCredentialsOperationSchema,
                packageName: z.string().min(1).max(256).optional(),
                credentialName: z.string().min(1).max(256).optional(),
                fieldType: fieldTypeSchema.optional(),
                value: z.string().min(1).max(4096).optional(),
                fields: z.array(z.object({ fieldType: fieldTypeSchema, value: z.string().min(1).max(4096) })).min(1).optional(),
            },
        },
        async (input) => asTextResult(await executeManageCredentialsOperation(input as ManageCredentialsInput, ctx)),
    );
}
