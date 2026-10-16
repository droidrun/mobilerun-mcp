import { describe, expect, spyOn, test } from 'bun:test';
import { buildMcpServer, createAuthContext, fullAccessPolicy } from '@mobilerun/mcp-tools';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createSdkBackend } from '../sdk-backend/index.js';
import { SdkClient, wrapSdkToolCalls } from '../sdk-backend/request-options.js';

function setup(fetch: NonNullable<ConstructorParameters<typeof SdkClient>[0]>['fetch'], signal?: AbortSignal, apiKey = 'test-key') {
    const sdk = new SdkClient({ apiKey, baseURL: 'https://example.com', fetch, maxRetries: 1 }, { signal });
    return createSdkBackend(sdk);
}

async function withTools(fetch: NonNullable<ConstructorParameters<typeof SdkClient>[0]>['fetch']) {
    const server = buildMcpServer({ backend: setup(fetch), auth: createAuthContext({ kind: 'api_key', subject: 'test' }), policy: fullAccessPolicy() }, { wrapRegisterTool: wrapSdkToolCalls });
    const client = new Client({ name: 'request-options-test', version: '1' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return { client, close: async () => { await client.close(); await server.close(); } };
}

describe('SDK request options', () => {
    test('purchase keys are stable within a window, rotate next window, and explicit keys win', async () => {
        const now = spyOn(Date, 'now').mockReturnValue(1_200_001);
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
            now.mockReturnValue(1_800_001);
            await client.callTool({ name: 'numbers', arguments: { operation: 'create', country: 'de', label: 'one' } });
            await client.callTool({ name: 'numbers', arguments: { operation: 'create', country: 'de', label: 'one', clientRequestId: 'explicit-key' } });
            expect(keys[4]).not.toBe(keys[0]);
            expect(keys[5]).toBe('explicit-key');
        } finally {
            now.mockRestore();
            await close();
        }
    });

    test('standalone purchases also receive stable keys', async () => {
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

    test.each([
        { name: 'create_device', args: { deviceType: 'android_cloud_phone' } },
        { name: 'connect', args: { operation: 'buy_proxy', country: 'de' } },
        { name: 'mailboxes', args: { operation: 'create', label: 'Inbox' } },
    ])('new purchase request ids are honored', async ({ name, args }) => {
        const keys: Array<string | null> = [];
        const { client, close } = await withTools(async (_input, init) => {
            keys.push(new Headers(init?.headers).get('Idempotency-Key'));
            return Response.json({ id: 'p1', type: 'android_cloud_phone' }, { headers: { 'Idempotent-Replayed': 'true' } });
        });
        try {
            const result = await client.callTool({ name, arguments: { ...args, clientRequestId: 'repeat-intentionally' } });
            expect(result.isError).not.toBe(true);
            expect(keys).toEqual(['repeat-intentionally']);
            expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining('"replayed":true') })]));
        } finally { await close(); }
    });

    test.each([
        { name: 'numbers', args: { operation: 'send', numberId: 'n1', to: '+49123456789', body: 'Hello' } },
        { name: 'mailboxes', args: { operation: 'restart', mailboxId: 'm1' } },
        { name: 'manage_device', args: { operation: 'stop', deviceId: 'd1' } },
        { name: 'manage_flow', args: { operation: 'run', flowId: 'f1' } },
        { name: 'manage_esim', args: { operation: 'activate', deviceId: 'd1', enable: true, smDpAddr: 'example.com' } },
    ])('repeatable operations get fresh SDK keys', async ({ name, args }) => {
        const keys: Array<string | null> = [];
        const { client, close } = await withTools(async (_input, init) => {
            keys.push(new Headers(init?.headers).get('Idempotency-Key'));
            return Response.json({ id: 'sms1' });
        });
        try {
            for (let i = 0; i < 2; i++) {
                expect((await client.callTool({ name, arguments: args })).isError).not.toBe(true);
            }
            expect(keys[0]).toBeTruthy();
            expect(keys[1]).not.toBe(keys[0]);
        } finally { await close(); }
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

    test('reads receive cancellation after dispatch', async () => {
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


test('writes aborted before dispatch are never sent', async () => {
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const backend = setup(async () => { calls++; return Response.json({}); }, controller.signal);
    await expect(backend.numbers.numbersCreate({ country: 'de' })).rejects.toThrow();
    expect(calls).toBe(0);
});

test('writes already sent complete after caller cancellation', async () => {
    const controller = new AbortController();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    let finish!: (response: Response) => void;
    let signal: AbortSignal | null | undefined;
    const backend = setup(async (_input, init) => {
        signal = init?.signal;
        started();
        return new Promise<Response>((resolve) => { finish = resolve; });
    }, controller.signal);
    const result = backend.numbers.numbersCreate({ country: 'de' });
    await ready;
    controller.abort();
    expect(signal?.aborted).toBe(false);
    finish(Response.json({ numberId: 'n1' }));
    expect(await result).toEqual({ numberId: 'n1' });
});

test('explicit request ids also cover external mailbox connections through the wrapper', async () => {
    const keys: Array<string | null> = [];
    const { client, close } = await withTools(async (_input, init) => {
        keys.push(new Headers(init?.headers).get('Idempotency-Key'));
        return Response.json({ id: 'c1' });
    });
    try {
        expect((await client.callTool({ name: 'mailboxes', arguments: { operation: 'connect', label: 'Inbox', clientRequestId: 'connection-1' } })).isError).not.toBe(true);
        expect(keys).toEqual(['connection-1']);
    } finally { await close(); }
});
