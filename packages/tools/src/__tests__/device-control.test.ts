import { connect } from './connect.js';
import { stubBackend } from './backend-stub.js';
import { describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
    return (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
}

const DEVICE_ID = 'd1';

describe('device-control bundle tools', () => {
    test('device_action passes humanize through to the backend', async () => {
        const backend = stubBackend();
        const captured: unknown[] = [];
        backend.deviceControl.tap = async (params: unknown) => void captured.push(params);
        const { client } = await connect('full', { backend });
        const result = await client.callTool({ name: 'device_action', arguments: { operation: 'tap', deviceId: DEVICE_ID, x: 1, y: 2, humanize: true } });
        expect(result.isError).not.toBe(true);
        expect(captured[0]).toMatchObject({ deviceId: DEVICE_ID, x: 1, y: 2, humanize: true });
    });

    test('manage_device_files: upload payload over the inline size cap is rejected before dispatch', async () => {
        const backend = stubBackend();
        const { client } = await connect('full', { backend });
        const oversized = 'A'.repeat(400_000); // > MAX_INLINE_BASE64_CHARS, also fails the schema's z.string().max()
        const result = await client.callTool({ name: 'manage_device_files', arguments: { operation: 'upload', deviceId: DEVICE_ID, path: '/f', contentBase64: oversized } });
        expect(result.isError).toBe(true);
        expect(backend.calls).not.toContain('deviceControl.uploadFile');
    });

});

test('device validation follows table order and deduplicates allowed fields', async () => {
    const backend = stubBackend();
    const { client } = await connect('full', { backend });
    try {
        const result = await client.callTool({
            name: 'device_action',
            arguments: { operation: 'clipboard_get', deviceId: DEVICE_ID, x: 1, text: 'extra' },
        });
        expect(result.isError).toBe(true);
        expect(textOf(result)).toBe(
            'field x, text is not valid for operation=clipboard_get; allowed fields: displayId',
        );
        expect(backend.calls).toHaveLength(0);
    } finally {
        await client.close();
    }
});
