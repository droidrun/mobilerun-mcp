import { expect, test } from 'bun:test';
import { connect } from './connect.js';
const stubOpts = { recordArgs: true, responses: {
    'deviceControl.manageDeviceScreenshotsCapture': { mimeType: 'image/png', contentBase64: 'iVBORw==' },
    'devices.getDeviceScreenshot': { deviceId: 'd1', screenshot: 'iVBORw==' },
    ...Object.fromEntries(['manageDeviceTrafficSessionsRetrieve', 'manageDeviceTrafficSessionsList'].map((method) => [
        `deviceControl.${method}`, { data: { items: [{ id: 's1', stream: { token: 'private-stream-token', url: 'https://example.com/stream' } }] } },
    ])),
} } as const;

test('both screenshot tools return MCP PNG images', async () => {
    const s = await connect('full', stubOpts);
    try {
        for (const input of [
            { name: 'get_device_screenshot', arguments: { deviceId: 'd1' } },
            { name: 'manage_device', arguments: { operation: 'screenshots_capture', deviceId: 'd1', save: false } },
        ]) {
            const result = await s.client.callTool(input);
            expect(result.isError).not.toBe(true);
            expect(result.content).toEqual([{ type: 'image', data: 'iVBORw==', mimeType: 'image/png' }]);
        }
    } finally {
        await s.close();
    }
});

test('readonly traffic reads redact stream tokens while preserving metadata', async () => {
    for (const profile of ['readonly', 'full'] as const) {
        const s = await connect(profile, stubOpts);
        try {
            for (const operation of ['traffic_sessions_retrieve', 'traffic_sessions_list']) {
                const result = await s.client.callTool({
                    name: 'manage_device',
                    arguments: {
                        operation,
                        deviceId: 'd1',
                        ...(operation.endsWith('retrieve') ? { sessionId: 's1' } : {}),
                    },
                });
                expect(result.isError).not.toBe(true);
                const text = (result.content as Array<{ text: string }>)[0]!.text;
                expect(text).toContain('https://example.com/stream');
                expect(text.includes('private-stream-token')).toBe(profile === 'full');
            }
        } finally {
            await s.close();
        }
    }
});

test('create tools return checkout URLs from subsequent backend reads', async () => {
    const s = await connect('full', { recordArgs: true, responses: {
        'numbers.numbersCreate': { data: { numberId: 'n1', state: 'awaiting_payment', checkoutUrl: null } },
        'mailboxes.mailboxesCreate': { data: { id: 'mb1', status: 'awaiting_payment', checkoutUrl: null } },
        'numbers.numbersGet': { data: { checkoutUrl: 'https://example.com/checkout' } },
        'mailboxes.mailboxesGet': { data: { checkoutUrl: 'https://example.com/checkout' } },
    } });
    try {
        for (const name of ['numbers', 'mailboxes']) {
            const result = await s.client.callTool({
                name,
                arguments: { operation: 'create', billingPreference: 'included_only', label: null },
            });
            expect(result.isError).not.toBe(true);
            expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text).data.checkoutUrl).toBe(
                'https://example.com/checkout',
            );
        }
        expect(s.calls).toEqual([
            { method: 'numbers.numbersCreate', args: [{ billingPreference: 'included_only', label: null }] },
            { method: 'numbers.numbersGet', args: [{ numberId: 'n1' }] },
            { method: 'mailboxes.mailboxesCreate', args: [{ billingPreference: 'included_only', label: null }] },
            { method: 'mailboxes.mailboxesGet', args: [{ mailboxId: 'mb1' }] },
        ]);
    } finally {
        await s.close();
    }
});

test('shared fields keep operation-specific types after flattening', async () => {
    const s = await connect('full', stubOpts);
    try {
        for (const input of [
            { name: 'device_action', arguments: { operation: 'global_action', deviceId: 'd1', action: 'VIEW' } },
            {
                name: 'device_action',
                arguments: { operation: 'deep_link', deviceId: 'd1', deepLink: 'https://example.com', action: 1 },
            },
            { name: 'webhooks', arguments: { operation: 'list', status: 'dead' } },
            { name: 'webhooks', arguments: { operation: 'deliveries', status: 'active' } },
        ])
            expect((await s.client.callTool(input)).isError).toBe(true);
        expect(s.calls).toEqual([]);
    } finally {
        await s.close();
    }
});
