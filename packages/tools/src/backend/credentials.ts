import { z } from 'zod';
// Credentials port — see devices.ts's file header for the DTO philosophy.
//
// Field values are write-only inputs. SdkBackend maps both list and write
// responses to CredentialMetaDto, keeping only metadata and field types.
// Values never leave the adapter in either response path.
import type { PageMeta } from './devices.js';

export interface CredentialFieldDto {
    fieldType: 'email' | 'username' | 'password' | 'api_token' | 'phone_number' | 'two_factor_secret' | 'backup_codes';
}

/** Normalized by SdkBackend — the SDK itself returns two different envelope
 * shapes for "all credentials" vs "credentials in one package" (verified
 * against credentials/credentials.d.ts vs credentials/packages/packages.d.ts);
 * this port exposes one consistent shape regardless of the `packageName` filter. */
interface CredentialListDto {
    items: CredentialMetaDto[];
    pagination?: PageMeta;
}

interface CredentialPackageDto {
    packageName: string;
}
interface CredentialPackageListDto {
    items: CredentialPackageDto[];
    /** Whether package names were derived instead of read directly. */
    derived: boolean;
}

// --- Write path (manage_credentials tool) -----------------------------
//
// SECRETS: a
// field `value` is a write-only INPUT here — list and write responses
// carry CredentialFieldDto (fieldType only). The adapter strips values at
// runtime; the port response types expose metadata only.

export interface CredentialMetaDto {
    credentialName: string;
    packageName: string;
    userId: string | null;
    secretPath: string;
    fields: CredentialFieldDto[];
}
interface CredentialMetaEnvelopeDto {
    data: CredentialMetaDto;
    message: string;
    success: true;
}

export interface InitPackageParams {
    packageName: string;
}
interface InitPackageResultDto {
    data: { packageName: string };
    message: string;
    success: true;
}

interface CreateCredentialFieldParams {
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
    manageCredentialsGet(params: z.infer<typeof manageCredentialsGetSchema>): Promise<unknown>;
    listCredentials(packageName?: string): Promise<CredentialListDto>;
    listCredentialPackages(): Promise<CredentialPackageListDto>;
    initPackage(params: InitPackageParams): Promise<InitPackageResultDto>;
    createCredential(params: CreateCredentialParams): Promise<CredentialMetaEnvelopeDto>;
    deleteCredential(params: DeleteCredentialParams): Promise<CredentialMetaEnvelopeDto>;
    addField(params: AddFieldParams): Promise<CredentialMetaEnvelopeDto>;
    updateField(params: UpdateFieldParams): Promise<CredentialMetaEnvelopeDto>;
    deleteField(params: DeleteFieldParams): Promise<CredentialMetaEnvelopeDto>;
}

export const manageCredentialsGetSchema = z
    .object({
        credentialName: z.string(),
        packageName: z.string(),
    })
    .strict();
