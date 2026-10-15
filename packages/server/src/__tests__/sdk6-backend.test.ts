import { describe, expect, test } from 'bun:test';
import { default as Mobilerun } from '@mobilerun/sdk';
import { createSdkBackend } from '../sdk-backend/index.js';
import { MAX_INLINE_FILE_BYTES } from '@mobilerun/mcp-tools';
import { capturedImage, signedDownload } from '../sdk-backend/response.js';
import { connect } from '../../../tools/src/__tests__/connect.js';

function setup(result: unknown = { data: { ok: true }, items: [] }) {
    const requests: Array<{ url: URL; method: string; headers: Headers; body: unknown }> = [];
    const client = new Mobilerun({
        apiKey: 'test-key',
        baseURL: 'https://example.com',
        maxRetries: 0,
        fetch: async (input, init) => {
            requests.push({
                url: new URL(String(input)),
                method: init?.method ?? 'GET',
                headers: new Headers(init?.headers),
                body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
            });
            return Response.json(result);
        },
    });
    return { backend: createSdkBackend(client), requests };
}

describe('SDK 6 domain requests', () => {
    test('numbers purchase respects API billing defaults and retry keys; SMS uses the number messages endpoint', async () => {
        const { backend, requests } = setup();
        await backend.numbers.numbersCreate({ country: 'de', label: 'Signup', clientRequestId: 'purchase-1' });
        expect(requests[0]!.url.pathname).toBe('/numbers/phones');
        expect(requests[0]!.body).toEqual({ country: 'de', label: 'Signup' });
        expect(requests[0]!.headers.get('Idempotency-Key')).toBe('purchase-1');
        await backend.numbers.numbersMessages({ numberId: 'n1', direction: 'inbound' });
        expect(requests[1]!.url.pathname).toBe('/numbers/phones/n1/messages');
        expect(requests[1]!.url.searchParams.get('direction')).toBe('inbound');
        await backend.numbers.numbersSend({ numberId: 'n1', to: '+49123456789', body: 'Hello' });
        expect(requests[2]!.url.pathname).toBe('/numbers/phones/n1/messages');
        expect(requests[2]!.method).toBe('POST');
        expect(requests[2]!.body).toEqual({ to: '+49123456789', body: 'Hello' });
    });

    test('mailbox lifecycle, email filters, opaque ids and consent use distinct routes', async () => {
        const { backend, requests } = setup();
        await backend.mailboxes.mailboxesCreate({ label: 'Signup', clientRequestId: 'mailbox-1' });
        expect(requests[0]!.url.pathname).toBe('/mailboxes');
        expect(requests[0]!.headers.get('Idempotency-Key')).toBe('mailbox-1');
        await backend.mailboxes.mailboxesUpdate({ mailboxId: 'mb1', label: null });
        expect(requests[1]!.body).toEqual({ label: null });
        await backend.mailboxes.mailboxesMessages({ mailboxId: 'mb1', cursor: 'next', hasOtp: false });
        expect(requests[2]!.url.pathname).toBe('/mailboxes/mb1/messages');
        expect(requests[2]!.url.searchParams.get('hasOtp')).toBe('false');
        expect(requests[2]!.url.searchParams.get('cursor')).toBe('next');
        await backend.mailboxes.mailboxesMessage({ mailboxId: 'mb1', messageId: 'opaque-message' });
        expect(requests[3]!.url.pathname).toBe('/mailboxes/mb1/messages/opaque-message');
        await backend.mailboxes.mailboxesConnect({ label: 'Personal', clientRequestId: 'connection-1' });
        expect(requests[4]!.url.pathname).toBe('/mailboxes/connections');
        expect(requests[4]!.headers.get('Idempotency-Key')).toBe('connection-1');
        await backend.mailboxes.mailboxesRestart({ mailboxId: 'mb1', billingPreference: 'rent' });
        expect(requests[5]!.url.pathname).toBe('/mailboxes/mb1/restart');
        expect(requests[5]!.body).toEqual({ billingPreference: 'rent' });
    });

    test('organization SMS includes both conversation cursors and the read watermark', async () => {
        const { backend, requests } = setup();
        await backend.messages.messagesList({ numberId: 'n1', direction: 'inbound' });
        expect(requests[0]!.url.pathname).toBe('/numbers/messages');
        await backend.messages.messagesGet({ messageId: 'sms1' });
        expect(requests[1]!.url.pathname).toBe('/numbers/messages/sms1');
        await backend.messages.messagesConversations({
            cursorLastMessageId: 'sms1',
            cursorLastOccurredAt: '2026-10-14T00:00:00Z',
        });
        expect(requests[2]!.url.pathname).toBe('/numbers/messages/conversations');
        expect(requests[2]!.url.searchParams.get('cursorLastMessageId')).toBe('sms1');
        expect(requests[2]!.url.searchParams.get('cursorLastOccurredAt')).toBe('2026-10-14T00:00:00Z');
        const watermark = { peerKey: 'peer1', upToMessageId: 'sms1', upToOccurredAt: '2026-10-14T00:00:00Z' };
        await backend.messages.messagesMarkRead(watermark);
        expect(requests[3]!.url.pathname).toBe('/numbers/messages/conversations/read');
        expect(requests[3]!.body).toEqual(watermark);
    });

    test('file upload URLs, confirmation and metadata updates stay separate', async () => {
        const { backend, requests } = setup();
        await backend.files.filesUploadUrl({ filename: 'notes.txt', mimeType: 'text/plain', sizeBytes: 42 });
        expect(requests[0]!.url.pathname).toBe('/agents/files/upload-url');
        expect(requests[0]!.body).toEqual({ filename: 'notes.txt', mimeType: 'text/plain', sizeBytes: 42 });
        await backend.files.filesConfirm({ fileId: 'f1' });
        expect(requests[1]!.url.pathname).toBe('/agents/files/f1/confirm');
        await backend.files.filesUpdate({ fileId: 'f1', enabled: false });
        expect(requests[2]!.method).toBe('PATCH');
        expect(requests[2]!.body).toEqual({ enabled: false });
    });

    test('device input and task requests pass humanize to the API', async () => {
        const { backend, requests } = setup();
        await backend.deviceControl.tap({ deviceId: 'd1', x: 1, y: 2, humanize: true });
        await backend.deviceControl.swipe({
            deviceId: 'd1',
            startX: 1,
            startY: 2,
            endX: 3,
            endY: 4,
            duration: 100,
            humanize: false,
        });
        await backend.deviceControl.keyboardWrite({ deviceId: 'd1', text: 'Hello', humanize: true });
        await backend.tasks.runTask({ deviceId: 'd1', task: 'Open settings', humanize: true });
        for (const [i, expected] of [true, false, true, true].entries()) {
            const request = requests[i]!;
            const query = request.url.searchParams;
            const body = request.body as Record<string, unknown> | undefined;
            expect(query.has('stealth')).toBe(false);
            expect(body && 'stealth' in body).not.toBe(true);
            expect(String(query.get('humanize') ?? body?.humanize)).toBe(String(expected));
        }
    });

    test.each([
        { fields: { humanize: true, stealth: false }, expected: true },
        { fields: { humanize: false, stealth: true }, expected: false },
        { fields: { stealth: true }, expected: true },
        { fields: { stealth: false }, expected: false },
        { fields: {}, expected: undefined },
    ])('get_task exposes humanize from API fields %j', async ({ fields, expected }) => {
        const { backend } = setup({ task: {
            id: 't1', deviceId: 'd1', llmModel: 'model', task: 'Open settings',
            userId: 'u1', status: 'running', ...fields,
        } });
        const { client } = await connect('full', { backend });
        const result = await client.callTool({ name: 'get_task', arguments: { taskId: 't1', view: 'summary' } });
        expect(result.isError).not.toBe(true);
        const content = result.content as Array<{ type: string; text?: string }>;
        const summary = JSON.parse(content[0]?.text ?? '{}');
        expect(summary.id).toBe('t1');
        expect(summary.humanize).toBe(expected);
        expect(summary).not.toHaveProperty('stealth');
    });

    test('media control tokens are forwarded as headers; void writes return JSON', async () => {
        const { backend, requests } = setup();
        expect(
            await backend.deviceControl.manageDeviceMediaSessionsActivate('d1', {
                sessionId: 's1',
                controlToken: 'media-token',
            }),
        ).toBeDefined();
        expect(requests[0]!.headers.get('X-Media-Control-Token')).toBe('media-token');
        expect(requests[0]!.url.search).toBe('');
        expect(await backend.deviceControl.deviceActionClipboardSet('d1', { text: 'Hello' })).toEqual({
            success: true,
        });
    });

    test('credential retrieval reuses metadata redaction and package listing uses the direct endpoint', async () => {
        const { backend, requests } = setup({
            data: {
                credentialName: 'login',
                packageName: 'com.example',
                userId: null,
                secretPath: 'secret-path',
                fields: [{ fieldType: 'password', value: 'must-not-leak' }],
            },
        });
        const result = await backend.credentials.manageCredentialsGet({
            credentialName: 'login',
            packageName: 'com.example',
        });
        expect(JSON.stringify(result)).not.toContain('must-not-leak');
        expect(result).toMatchObject({ data: { fields: [{ fieldType: 'password' }] } });
        expect(requests[0]!.url.pathname).toBe('/credentials/packages/com.example/credentials/login');
        const packages = setup({ data: [{ packageName: 'com.example' }] });
        expect(await packages.backend.credentials.listCredentialPackages()).toEqual({
            items: [{ packageName: 'com.example' }],
            derived: false,
        });
        expect(packages.requests[0]!.url.pathname).toBe('/credentials/packages');
    });
});

test('signed downloads return the destination and cancel binary response bodies', async () => {
    let cancelled = false;
    const response = new Response(
        new ReadableStream({
            cancel: () => {
                cancelled = true;
            },
        }),
    );
    Object.defineProperties(response, {
        redirected: { value: true },
        url: { value: 'https://example.com/signed-image' },
    });
    expect(await signedDownload({ asResponse: async () => response })).toEqual({
        url: 'https://example.com/signed-image',
    });
    expect(cancelled).toBe(true);
    await expect(signedDownload({ asResponse: async () => new Response(null) })).rejects.toThrow('signed destination');
});

test('screenshot capture preserves PNG bytes and enforces the inline limit', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const result = await capturedImage({
        asResponse: async () => new Response(png, { headers: { 'content-type': 'image/png' } }),
    });
    expect(result.mimeType).toBe('image/png');
    expect(Buffer.from(result.contentBase64, 'base64')).toEqual(Buffer.from(png));
    const oversized = new Uint8Array(MAX_INLINE_FILE_BYTES + 1);
    await expect(
        capturedImage({
            asResponse: async () => new Response(oversized, { headers: { 'content-type': 'image/png' } }),
        }),
    ).rejects.toThrow('inline limit');
});

test('device reads and creation forward canonical type identifiers', async () => {
    const { backend, requests } = setup();
    await backend.devices.listDevices({ type: 'android_cloud_phone' });
    expect(requests[0]!.url.searchParams.get('type')).toBe('android_cloud_phone');
    await backend.devices.createDevice({ deviceType: 'android_cloud_phone', country: 'de' });
    expect(requests[1]!.url.searchParams.get('deviceType')).toBe('android_cloud_phone');
    expect(requests[1]!.url.searchParams.get('country')).toBe('DE');
});

test('number billing preferences pass through without a hard-coded default', async () => {
    const { backend, requests } = setup();
    for (const billingPreference of ['included', 'included_only', 'rent'] as const) {
        await backend.numbers.numbersCreate({ billingPreference });
        expect(requests.at(-1)!.body).toEqual({ billingPreference });
    }
});

test('mailbox create treats null as an omitted initial label', async () => {
    const { backend, requests } = setup();
    await backend.mailboxes.mailboxesCreate({ label: null });
    expect(requests[0]!.body).toEqual({});
});

test('screenshot body timeout cancels a stalled stream', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
        cancel() {
            cancelled = true;
        },
    });
    await expect(
        capturedImage(
            {
                asResponse: async () => new Response(stream, { headers: { 'content-type': 'image/png' } }),
            },
            15,
        ),
    ).rejects.toThrow('timed out');
    expect(cancelled).toBe(true);
});

test('signed URLs use manual redirects without fetching the object', async () => {
    const requests: Array<{ url: string; redirect: string | undefined }> = [];
    const client = new Mobilerun({
        apiKey: 'test-key',
        baseURL: 'https://example.com',
        maxRetries: 0,
        fetch: async (input, init) => {
            requests.push({ url: String(input), redirect: init?.redirect });
            return new Response(null, { status: 302, headers: { location: 'https://example.com/signed-object' } });
        },
    });
    const backend = createSdkBackend(client);
    for (const result of [
        await backend.files.filesDownload({ fileId: 'f1' }),
        await backend.deviceControl.manageDeviceScreenshotsImage('d1', { screenshotId: 's1' }),
        await backend.workflows.manageFlowExecutionScreenshot({ executionId: 'e1', screenshotId: 's1' }),
    ])
        expect(result).toEqual({ url: 'https://example.com/signed-object' });
    expect(requests).toHaveLength(3);
    expect(requests.every((request) => request.redirect === 'manual' && !request.url.includes('signed-object'))).toBe(
        true,
    );
});

test('standalone and bundle screenshot methods share the PNG capture endpoint', async () => {
    const requests: Array<{ path: string; save: string | null }> = [];
    const png = new Uint8Array([137, 80, 78, 71]);
    const client = new Mobilerun({
        apiKey: 'test-key',
        baseURL: 'https://example.com',
        fetch: async (input, init) => {
            const url = new URL(String(input));
            requests.push({ path: url.pathname, save: url.searchParams.get('save') });
            return new Response(png, { headers: { 'content-type': 'image/png' } });
        },
    });
    const backend = createSdkBackend(client);
    expect(await backend.devices.getDeviceScreenshot('d1')).toEqual({
        deviceId: 'd1',
        screenshot: Buffer.from(png).toString('base64'),
    });
    expect(await backend.deviceControl.manageDeviceScreenshotsCapture('d1', { save: false })).toEqual({
        mimeType: 'image/png',
        contentBase64: Buffer.from(png).toString('base64'),
    });
    expect(requests).toEqual(Array(2).fill({ path: '/devices/d1/screenshots', save: 'false' }));
});
