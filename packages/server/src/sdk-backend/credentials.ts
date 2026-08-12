import type Mobilerun from '@mobilerun/sdk';
import type {
    AddFieldParams,
    CreateCredentialParams,
    CredentialFieldDto,
    CredentialMetaDto,
    CredentialsBackend,
    DeleteCredentialParams,
    DeleteFieldParams,
    InitPackageParams,
    UpdateFieldParams,
} from '@mobilerun/mcp-tools';

/**
 * Strips `value` from every field of a raw @mobilerun/sdk `Credential` —
 * the ONLY place in this codebase where a plaintext credential value from
 * a write response is handled, and it is dropped here before the result
 * ever reaches the tools-package Backend port (whose `CredentialMetaDto`
 * type has no `value` field to begin with — see backend/credentials.ts's
 * SECRETS note). Exported for the "no value echo" test.
 */
export function toCredentialMeta(cred: {
    credentialName: string;
    packageName: string;
    userId: string;
    secretPath: string;
    fields: Array<{ fieldType: CredentialFieldDto['fieldType']; value: string }>;
}): CredentialMetaDto {
    return {
        credentialName: cred.credentialName,
        packageName: cred.packageName,
        userId: cred.userId,
        secretPath: cred.secretPath,
        fields: cred.fields.map((f) => ({ fieldType: f.fieldType })),
    };
}

export function createCredentialsBackend(client: Mobilerun): CredentialsBackend {
    return {
        async listCredentials(packageName?: string) {
            // NORMALIZATION: the
            // SDK itself returns two different envelope shapes depending on the
            // filter — `packages.list(name)` -> `{ data: Credential[] }` (no
            // pagination), `credentials.list()` -> `{ items, pagination }`
            // (verified against credentials/packages/packages.d.ts vs
            // credentials/credentials.d.ts). Normalized here to one consistent
            // `{ items, pagination? }` shape so the port's return type isn't a
            // leaky union of the SDK's own inconsistency.
            if (packageName) {
                const result = await client.credentials.packages.list(packageName);
                return { items: result.data };
            }
            const result = await client.credentials.list({});
            return { items: result.items, pagination: result.pagination };
        },
        async listCredentialPackages() {
            // GAP: @mobilerun/sdk has no "list all packages with credentials"
            // endpoint — verified against credentials/packages/packages.d.ts:
            // `packages.list(packageName)` lists credentials WITHIN one already-
            // known package, it doesn't enumerate package names. Derived here
            // from the top-level credentials.list() by collecting distinct
            // `packageName` values across (bounded) pages, rather than inventing
            // a raw-fetch call to an undocumented endpoint. This is a known,
            // documented limitation (see the roadmap).
            const packageNames = new Set<string>();
            let page = 1;
            const pageSize = 100;
            const MAX_PAGES = 20; // bound: 2000 credentials is enough headroom, avoids an unbounded loop
            for (; page <= MAX_PAGES; page++) {
                const result = await client.credentials.list({ page, pageSize });
                const items = result.items ?? [];
                for (const item of items) {
                    if (item && typeof item === 'object' && 'packageName' in item) {
                        packageNames.add((item as { packageName: string }).packageName);
                    }
                }
                const totalPages = (result.pagination as { pages?: number } | undefined)?.pages;
                if (!totalPages || page >= totalPages || items.length < pageSize) break;
            }
            return { items: Array.from(packageNames).map((packageName) => ({ packageName })), derived: true as const };
        },
        async initPackage(params: InitPackageParams) {
            return client.credentials.packages.create({ packageName: params.packageName });
        },
        async createCredential(params: CreateCredentialParams) {
            const result = await client.credentials.packages.credentials.create(params.packageName, {
                credentialName: params.credentialName,
                fields: params.fields,
            });
            return { data: toCredentialMeta(result.data), message: result.message, success: result.success };
        },
        async deleteCredential(params: DeleteCredentialParams) {
            const result = await client.credentials.packages.credentials.delete(params.credentialName, { packageName: params.packageName });
            return { data: toCredentialMeta(result.data), message: result.message, success: result.success };
        },
        async addField(params: AddFieldParams) {
            const result = await client.credentials.packages.credentials.fields.create(params.credentialName, {
                packageName: params.packageName,
                fieldType: params.fieldType,
                value: params.value,
            });
            return { data: toCredentialMeta(result.data), message: result.message, success: result.success };
        },
        async updateField(params: UpdateFieldParams) {
            const result = await client.credentials.packages.credentials.fields.update(params.fieldType, {
                packageName: params.packageName,
                credentialName: params.credentialName,
                value: params.value,
            });
            return { data: toCredentialMeta(result.data), message: result.message, success: result.success };
        },
        async deleteField(params: DeleteFieldParams) {
            const result = await client.credentials.packages.credentials.fields.delete(params.fieldType, {
                packageName: params.packageName,
                credentialName: params.credentialName,
            });
            return { data: toCredentialMeta(result.data), message: result.message, success: result.success };
        },
    };
}
