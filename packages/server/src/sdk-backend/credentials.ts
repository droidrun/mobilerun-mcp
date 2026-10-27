/**
 * Strips `value` from every field of a raw @mobilerun/sdk `Credential` —
 * the ONLY place in this codebase where a plaintext credential value from
 * a list or write response is handled, and it is dropped here before the result
 * ever reaches the tools-package Backend port (whose `CredentialMetaDto`
 * type has no `value` field to begin with — see backend/credentials.ts's
 * SECRETS note).
 */
import { type default as Mobilerun } from '@mobilerun/sdk';
import {
    BackendError,
    type AddFieldParams,
    type CreateCredentialParams,
    type CredentialFieldDto,
    type CredentialMetaDto,
    type CredentialsBackend,
    type DeleteCredentialParams,
    type DeleteFieldParams,
    type InitPackageParams,
    type UpdateFieldParams,
} from '@mobilerun/mcp-tools';

function toCredentialMeta(cred: {
    credentialName: string;
    packageName: string;
    userId: string | null;
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
        async manageCredentialsGet(params) {
            const result = await client.credentials.packages.list(params.packageName);
            const credential = result.data.find((c) => c.credentialName === params.credentialName);
            if (!credential) {
                throw new BackendError(
                    'not_found',
                    `Credential '${params.credentialName}' not found in package '${params.packageName}'`,
                    404,
                );
            }
            return { data: toCredentialMeta(credential) };
        },
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
                return { items: result.data.map(toCredentialMeta) };
            }
            const result = await client.credentials.list({});
            return { items: result.items.map(toCredentialMeta), pagination: result.pagination };
        },
        async listCredentialPackages() {
            const result = await client.credentials.packages.listAll();
            return { items: result.data.map(({ packageName }) => ({ packageName })), derived: false };
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
            const result = await client.credentials.packages.credentials.delete(params.credentialName, {
                packageName: params.packageName,
            });
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
