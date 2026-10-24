import { describe, expect, test } from 'bun:test';
import type Mobilerun from '@mobilerun/sdk';
import { BackendError, type CredentialMetaDto, type PageMeta } from '@mobilerun/mcp-tools';
import { createCredentialsBackend } from '../sdk-backend/credentials.js';
import { withBackendErrors } from '../sdk-backend/errors.js';

describe('credential list metadata', () => {
    test.each([undefined, 'com.example'])('omits field values (packageName=%s)', async (packageName) => {
        const metadata: CredentialMetaDto[] = [
            {
                credentialName: 'main', packageName: 'com.example', userId: 'user-1', secretPath: 'credentials/main',
                fields: [{ fieldType: 'username' }, { fieldType: 'password' }],
            },
            {
                credentialName: 'backup', packageName: 'com.example', userId: null, secretPath: 'credentials/backup',
                fields: [{ fieldType: 'api_token' }],
            },
        ];
        const credentials = metadata.map((credential) => ({
            ...credential,
            fields: credential.fields.map((field) => ({ ...field, value: 'test-credential-value' })),
        }));
        const pagination = { page: 1, pages: 2, pageSize: 2, total: 4, hasNext: true, hasPrev: false } satisfies PageMeta;
        const calls: unknown[] = [];
        const client = {
            credentials: {
                list: async (params: unknown) => {
                    calls.push({ method: 'list', params });
                    return { items: credentials, pagination };
                },
                packages: { list: async (name: string) => {
                    calls.push({ method: 'packages.list', name });
                    return { data: credentials };
                } },
            },
        } as unknown as Mobilerun;

        const result = await createCredentialsBackend(client).listCredentials(packageName);

        expect(result).toEqual(packageName ? { items: metadata } : { items: metadata, pagination });
        expect(JSON.stringify(result)).not.toMatch(/"value"\s*:/);
        expect(JSON.stringify(result)).not.toContain('test-credential-value');
        expect(calls).toEqual(packageName ? [{ method: 'packages.list', name: packageName }] : [{ method: 'list', params: {} }]);
    });
});

describe('credential get metadata', () => {
    const credentials = [
        {
            credentialName: 'main', packageName: 'com-example', userId: 'user-1', secretPath: 'credentials/main',
            fields: [{ fieldType: 'username', value: 'test-credential-value' }],
        },
        {
            credentialName: 'backup', packageName: 'com-example', userId: null, secretPath: 'credentials/backup',
            fields: [{ fieldType: 'api_token', value: 'test-credential-value' }],
        },
    ];
    const makeClient = (calls: unknown[]) => ({
        credentials: {
            packages: {
                list: async (name: string) => {
                    calls.push({ method: 'packages.list', name });
                    return { data: credentials };
                },
                credentials: { retrieve: async () => { calls.push({ method: 'retrieve' }); throw new Error('retrieve called'); } },
            },
        },
    }) as unknown as Mobilerun;

    test('reads metadata from the package list without values', async () => {
        const calls: unknown[] = [];
        const backend = withBackendErrors(createCredentialsBackend(makeClient(calls)));

        const result = await backend.manageCredentialsGet({ packageName: 'com.example', credentialName: 'backup' });

        expect(result).toEqual({
            data: {
                credentialName: 'backup', packageName: 'com-example', userId: null, secretPath: 'credentials/backup',
                fields: [{ fieldType: 'api_token' }],
            },
        });
        expect(JSON.stringify(result)).not.toContain('test-credential-value');
        expect(calls).toEqual([{ method: 'packages.list', name: 'com.example' }]);
    });

    test('missing credential is a not_found BackendError', async () => {
        const calls: unknown[] = [];
        const backend = withBackendErrors(createCredentialsBackend(makeClient(calls)));

        const error = (await backend.manageCredentialsGet({ packageName: 'com.example', credentialName: 'nope' }).catch((e: unknown) => e)) as BackendError;

        expect(error).toBeInstanceOf(BackendError);
        expect(error.code).toBe('not_found');
        expect(error.status).toBe(404);
        expect(calls).toEqual([{ method: 'packages.list', name: 'com.example' }]);
    });
});
