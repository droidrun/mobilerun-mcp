import { describe, expect, test } from 'bun:test';
import Mobilerun from '@mobilerun/sdk';
import { MAX_INLINE_FILE_BYTES } from '@mobilerun/mcp-tools';
import { createSdkBackend } from '../sdk-backend/index.js';
import { readBoundedBody } from '../sdk-backend/response.js';

function setup(fetch: NonNullable<ConstructorParameters<typeof Mobilerun>[0]>['fetch']) {
    return createSdkBackend(new Mobilerun({ apiKey: 'test-key', baseURL: 'https://example.com', fetch }));
}

describe('bounded device downloads', () => {
    test('raw bytes are returned as base64, including non-text bytes', async () => {
        const bytes = new Uint8Array([0, 255, 128, 65]);
        const backend = setup(async () => new Response(bytes));
        expect(await backend.deviceControl.downloadFile('d1', '/file')).toEqual({ content: Buffer.from(bytes).toString('base64') });
    });

    test('the size cap cancels the stream before the remaining body is read', async () => {
        let pulls = 0;
        let cancelled = false;
        const response = new Response(new ReadableStream({
            pull(controller) {
                pulls++;
                controller.enqueue(new Uint8Array(MAX_INLINE_FILE_BYTES));
            },
            cancel() { cancelled = true; },
        }, { highWaterMark: 0 }));
        const backend = setup(async () => response);
        await expect(backend.deviceControl.downloadFile('d1', '/file')).rejects.toThrow('inline limit');
        expect(cancelled).toBe(true);
        expect(pulls).toBe(2);
    });

    test('a stalled response body is cancelled at its deadline', async () => {
        let cancelled = false;
        const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }));
        await expect(readBoundedBody(response, 'Device file', 10)).rejects.toThrow('timed out');
        expect(cancelled).toBe(true);
    });
});


test('declared oversized bodies are cancelled before any read', async () => {
    let pulls = 0;
    let cancelled = false;
    const response = new Response(new ReadableStream({
        pull() { pulls++; },
        cancel() { cancelled = true; },
    }, { highWaterMark: 0 }), { headers: { 'content-length': String(MAX_INLINE_FILE_BYTES + 1) } });
    await expect(readBoundedBody(response, 'Device file')).rejects.toThrow('inline limit');
    expect(pulls).toBe(0);
    expect(cancelled).toBe(true);
});
