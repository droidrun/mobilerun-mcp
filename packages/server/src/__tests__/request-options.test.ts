import { describe, expect, test } from 'bun:test';
import Mobilerun from '@mobilerun/sdk';
import { connect } from '../../../tools/src/__tests__/connect.js';
import { createSdkBackend } from '../sdk-backend/index.js';
import { wrapSdkToolCalls } from '../sdk-backend/request-options.js';

function setup(fetch: NonNullable<ConstructorParameters<typeof Mobilerun>[0]>['fetch'], signal?: AbortSignal, apiKey = 'test-key') {
    const sdk = new Mobilerun({ apiKey, baseURL: 'https://example.com', fetch, maxRetries: 1 });
    return createSdkBackend(sdk, { signal });
}

async function withTools(fetch: NonNullable<ConstructorParameters<typeof Mobilerun>[0]>['fetch']) {
    return connect('full', { backend: setup(fetch), serverOptions: { wrapRegisterTool: wrapSdkToolCalls } });
}

describe('SDK request options', () => {
    test('billed keys survive retries and reordered fields; distinct inputs differ and explicit keys win', async () => {
        const keys: Array<string | null> = [];
        const { client, close } = await withTools(async (_input, init) => {
            keys.push(new Headers(init?.headers).get('Idempotency-Key'));
            return Response.json({ id: 'n1' });
        });
        try {
            for (const args of [
                { operation: 'create', country: 'de', label: 'one' },
                { label: 'one', country: 'de', operation: 'create' },
                { operation: 'create', country: 'de', label: 'two' },
                { operation: 'create', country: 'de', label: 'one', clientRequestId: 'explicit-key' },
            ]) {
                const result = await client.callTool({ name: 'numbers', arguments: args });
                expect(result.isError).not.toBe(true);
            }
            expect(keys[0]).toMatch(/^[a-f0-9]{32}$/);
            expect(keys[1]).toBe(keys[0]);
            expect(keys[2]).not.toBe(keys[0]);
            expect(keys[3]).toBe('explicit-key');
        } finally {
            await close();
        }
    });

    test('standalone billed operations also receive stable keys', async () => {
        const keys: Array<string | null> = [];
        const { client, close } = await withTools(async (_input, init) => {
            keys.push(new Headers(init?.headers).get('Idempotency-Key'));
            return Response.json({ id: 'd1', type: 'android_cloud_phone' });
        });
        try {
            for (let i = 0; i < 2; i++) {
                expect((await client.callTool({ name: 'create_device', arguments: { deviceType: 'android_cloud_phone' } })).isError).not.toBe(true);
            }
            expect(keys[0]).toBeTruthy();
            expect(keys[1]).toBe(keys[0]);
        } finally {
            await close();
        }
    });

    test('POST is sent once on a retryable failure; GET keeps retries and has no key', async () => {
        const requests: Array<{ method: string; key: string | null }> = [];
        const backend = setup(async (_input, init) => {
            requests.push({ method: init!.method!, key: new Headers(init?.headers).get('Idempotency-Key') });
            return Response.json({ error: 'try later' }, { status: 500 });
        });
        await expect(backend.numbers.numbersCreate({ country: 'de' })).rejects.toThrow();
        expect(requests).toHaveLength(1);
        await expect(backend.numbers.numbersCountries()).rejects.toThrow();
        expect(requests).toHaveLength(3);
        expect(requests.slice(1).every(({ method, key }) => method === 'GET' && key === null)).toBe(true);
    });

    test('upstream requests receive cancellation after dispatch', async () => {
        const controller = new AbortController();
        let started!: () => void;
        const ready = new Promise<void>((resolve) => { started = resolve; });
        let upstreamSignal: AbortSignal | null | undefined;
        const backend = setup(async (_input, init) => {
            upstreamSignal = init?.signal;
            started();
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
            });
        }, controller.signal);
        const result = backend.numbers.numbersCountries();
        await ready;
        controller.abort();
        await expect(result).rejects.toThrow();
        expect(upstreamSignal?.aborted).toBe(true);
    });
});

