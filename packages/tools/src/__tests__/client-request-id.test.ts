import { expect, test } from 'bun:test';
import { clientRequestIdSchema } from '../backend/communication.js';
import { connect } from './connect.js';

test('request ids accept only 1–128 printable non-space ASCII characters', () => {
    for (const key of [undefined, '!', '~', 'retry-1', 'a'.repeat(128), Array.from({ length: 94 }, (_, i) => String.fromCharCode(i + 33)).join('')]) {
        expect(clientRequestIdSchema.safeParse(key).success).toBe(true);
    }
    for (const key of ['', 'a'.repeat(129), ' ', 'two words', 'line\nbreak', '\r', '\t', '\x00', '\x7f', 'café', '😀']) {
        expect(clientRequestIdSchema.safeParse(key).success).toBe(false);
    }
});

test.each([
    { name: 'create_device', args: { deviceType: 'android_cloud_phone' } },
    { name: 'connect', args: { operation: 'buy_proxy', country: 'de' } },
    { name: 'numbers', args: { operation: 'create', country: 'de' } },
    { name: 'mailboxes', args: { operation: 'create', label: 'Inbox' } },
])('purchase tools reject invalid request ids before dispatch', async ({ name, args }) => {
    const { client, backend, close } = await connect('full');
    try {
        for (const clientRequestId of ['line\nbreak', 'café', ' ']) {
            const result = await client.callTool({ name, arguments: { ...args, clientRequestId } });
            expect(result.isError).toBe(true);
        }
        expect(backend.calls).toEqual([]);
    } finally {
        await close();
    }
});
