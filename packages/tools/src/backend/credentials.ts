// Credentials port — see devices.ts's file header for the DTO philosophy.
//
// SECURITY NOTE (flagged, not fixed here — outside this brief's scope):
// @mobilerun/sdk's `Credential.fields[].value` is typed as a plain `string`
// (verified against credentials/packages/credentials/credentials.d.ts) with
// no documented masking. The `list_credentials` tool description promises
// "metadata only — values never leave credentials storage"; whether the
// live API actually redacts `value` server-side is UNVERIFIED from the
// SDK's .d.ts alone. Flagged for the orchestrator — this DTO types the
// field as shipped, it does not redact it.
import type { PageMeta } from './devices.js';

export interface CredentialFieldDto {
    fieldType:
        | 'email'
        | 'username'
        | 'password'
        | 'api_token'
        | 'phone_number'
        | 'two_factor_secret'
        | 'backup_codes';
    value: string;
}

export interface CredentialDto {
    credentialName: string;
    packageName: string;
    userId: string;
    secretPath: string;
    fields: CredentialFieldDto[];
}

/** Normalized by SdkBackend — the SDK itself returns two different envelope
 * shapes for "all credentials" vs "credentials in one package" (verified
 * against credentials/credentials.d.ts vs credentials/packages/packages.d.ts);
 * this port exposes one consistent shape regardless of the `packageName` filter. */
export interface CredentialListDto {
    items: CredentialDto[];
    pagination?: PageMeta;
}

export interface CredentialPackageDto {
    packageName: string;
}
export interface CredentialPackageListDto {
    items: CredentialPackageDto[];
    /** True: derived client-side from paginated credentials.list (no direct SDK endpoint) — see SdkBackend. */
    derived: true;
}

// --- Write path (manage_credentials tool) -----------------------------
//
// SECRETS: a
// field `value` is a write-only INPUT here — every write response type
// below carries `CredentialFieldMetaDto` (fieldType only), never
// `CredentialFieldDto` (which has `value`). This is a type-level
// guarantee, not a runtime redaction step: no conforming `CredentialsBackend`
// implementation can accidentally echo a plaintext value back, because the
// return type has nowhere to put it.

export interface CredentialFieldMetaDto {
    fieldType: CredentialFieldDto['fieldType'];
}
export interface CredentialMetaDto {
    credentialName: string;
    packageName: string;
    userId: string;
    secretPath: string;
    fields: CredentialFieldMetaDto[];
}
export interface CredentialMetaEnvelopeDto {
    data: CredentialMetaDto;
    message: string;
    success: true;
}

export interface InitPackageParams {
    packageName: string;
}
export interface InitPackageResultDto {
    data: { packageName: string };
    message: string;
    success: true;
}

export interface CreateCredentialFieldParams {
    fieldType: CredentialFieldDto['fieldType'];
    value: string;
}
export interface CreateCredentialParams {
    packageName: string;
    credentialName: string;
    fields: CreateCredentialFieldParams[];
}
export interface DeleteCredentialParams {
    packageName: string;
    credentialName: string;
}
export interface AddFieldParams {
    packageName: string;
    credentialName: string;
    fieldType: CredentialFieldDto['fieldType'];
    value: string;
}
export interface UpdateFieldParams {
    packageName: string;
    credentialName: string;
    fieldType: CredentialFieldDto['fieldType'];
    value: string;
}
export interface DeleteFieldParams {
    packageName: string;
    credentialName: string;
    fieldType: CredentialFieldDto['fieldType'];
}

export interface CredentialsBackend {
    listCredentials(packageName?: string): Promise<CredentialListDto>;
    listCredentialPackages(): Promise<CredentialPackageListDto>;
    initPackage(params: InitPackageParams): Promise<InitPackageResultDto>;
    createCredential(params: CreateCredentialParams): Promise<CredentialMetaEnvelopeDto>;
    deleteCredential(params: DeleteCredentialParams): Promise<CredentialMetaEnvelopeDto>;
    addField(params: AddFieldParams): Promise<CredentialMetaEnvelopeDto>;
    updateField(params: UpdateFieldParams): Promise<CredentialMetaEnvelopeDto>;
    deleteField(params: DeleteFieldParams): Promise<CredentialMetaEnvelopeDto>;
}
