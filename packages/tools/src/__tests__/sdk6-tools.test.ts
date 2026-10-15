import { expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { type Backend } from '../backend/index.js';
import { createAuthContext } from '../ctx.js';
import { policyForProfile, type PolicyProfile } from '../policies.js';
import { buildMcpServer } from '../register.js';

type Call = { method: string; args: readonly unknown[] };
async function session(profile: PolicyProfile = 'full', pendingCheckout = false) {
    const calls: Call[] = [];
    const backend = new Proxy(
        {},
        {
            get: (_, domain) =>
                new Proxy(
                    {},
                    {
                        get:
                            (_, method) =>
                            async (...args: unknown[]) => {
                                calls.push({ method: `${String(domain)}.${String(method)}`, args });
                                if (pendingCheckout) {
                                    if (method === 'numbersCreate')
                                        return {
                                            data: { numberId: 'n1', state: 'awaiting_payment', checkoutUrl: null },
                                        };
                                    if (method === 'mailboxesCreate')
                                        return { data: { id: 'mb1', status: 'awaiting_payment', checkoutUrl: null } };
                                    if (method === 'numbersGet' || method === 'mailboxesGet')
                                        return { data: { checkoutUrl: 'https://example.com/checkout' } };
                                }
                                if (method === 'manageDeviceScreenshotsCapture')
                                    return { mimeType: 'image/png', contentBase64: 'iVBORw==' };
                                if (method === 'getDeviceScreenshot') return { deviceId: 'd1', screenshot: 'iVBORw==' };
                                if (String(method).startsWith('manageDeviceTrafficSessions'))
                                    return {
                                        data: {
                                            items: [
                                                {
                                                    id: 's1',
                                                    stream: {
                                                        token: 'private-stream-token',
                                                        url: 'https://example.com/stream',
                                                    },
                                                },
                                            ],
                                        },
                                    };
                                return { accepted: true };
                            },
                    },
                ),
        },
    ) as Backend;
    const server = buildMcpServer({
        backend,
        policy: policyForProfile(profile),
        auth: createAuthContext({ kind: 'api_key', subject: 'test' }),
    });
    const client = new Client({ name: 'flat-input-test', version: '0.0.0' });
    const [c, s] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(c), server.connect(s)]);
    return {
        client,
        calls,
        close: async () => {
            await client.close();
            await server.close();
        },
    };
}

test('new bundle operations use top-level identities and flat parameters', async () => {
    const s = await session();
    const endpointId = '550e8400-e29b-41d4-a716-446655440000';
    const cases: Array<{ name: string; arguments: Record<string, unknown>; method: string; args: unknown[] }> = [
        {
            name: 'connect',
            arguments: { operation: 'update_proxy', proxyId: 'p1', name: null },
            method: 'connect.connectUpdateProxy',
            args: [{ proxyId: 'p1', name: null }],
        },
        {
            name: 'connect',
            arguments: { operation: 'ensure_healthy', proxyId: 'p1' },
            method: 'connect.connectEnsureHealthy',
            args: [{ proxyId: 'p1' }],
        },
        {
            name: 'webhooks',
            arguments: { operation: 'delete', endpointId },
            method: 'webhooks.webhooksDelete',
            args: [{ endpointId }],
        },
        {
            name: 'webhooks',
            arguments: { operation: 'deliveries', status: 'dead', page: 2 },
            method: 'webhooks.webhooksDeliveries',
            args: [{ status: 'dead', page: 2 }],
        },
        {
            name: 'manage_credentials',
            arguments: { operation: 'get', packageName: 'example.app', credentialName: 'login' },
            method: 'credentials.manageCredentialsGet',
            args: [{ packageName: 'example.app', credentialName: 'login' }],
        },
        {
            name: 'manage_flow',
            arguments: { operation: 'update', flowId: 'f1', enabled: false, delivery: null },
            method: 'workflows.manageFlowUpdate',
            args: [{ flowId: 'f1', enabled: false, delivery: null }],
        },
        {
            name: 'manage_flow',
            arguments: { operation: 'update_action', actionId: 'a1', params: { text: 'Hello' } },
            method: 'workflows.manageFlowUpdateAction',
            args: [{ actionId: 'a1', params: { text: 'Hello' } }],
        },
        {
            name: 'manage_device',
            arguments: { operation: 'recordings_stop', deviceId: 'd1', recordingId: 'r1' },
            method: 'deviceControl.manageDeviceRecordingsStop',
            args: ['d1', { recordingId: 'r1' }],
        },
        {
            name: 'configure_device',
            arguments: { operation: 'kiosk_enable', deviceId: 'd1', packageName: 'example.app' },
            method: 'deviceControl.configureDeviceKioskEnable',
            args: ['d1', { packageName: 'example.app' }],
        },
        {
            name: 'device_action',
            arguments: {
                operation: 'deep_link',
                deviceId: 'd1',
                deepLink: 'https://example.com',
                action: 'VIEW',
                displayId: 1,
            },
            method: 'deviceControl.deviceActionDeepLink',
            args: ['d1', { deepLink: 'https://example.com', action: 'VIEW', displayId: 1 }],
        },
    ];
    try {
        for (const item of cases) {
            const result = await s.client.callTool({ name: item.name, arguments: item.arguments });
            expect(result.isError, `${item.name}.${String(item.arguments.operation)}`).not.toBe(true);
            expect(s.calls.pop()).toEqual({ method: item.method, args: item.args });
        }
    } finally {
        await s.close();
    }
});

test('account operations and parameterless methods have no dummy arguments', async () => {
    const s = await session();
    try {
        for (const [name, operation, method, args] of [
            ['manage_device', 'summary', 'deviceControl.manageDeviceSummary', [{}]],
            ['manage_device', 'count', 'deviceControl.countDevices', []],
            ['apps', 'storage_usage', 'apps.appsStorageUsage', []],
            ['numbers', 'countries', 'numbers.numbersCountries', []],
            ['mailboxes', 'capacity', 'mailboxes.mailboxesCapacity', []],
            ['webhooks', 'integrations', 'webhooks.webhooksIntegrations', []],
            ['manage_flow', 'capacity', 'workflows.manageFlowCapacity', []],
        ] as const) {
            const result = await s.client.callTool({ name, arguments: { operation } });
            expect(result.isError, operation).not.toBe(true);
            expect(s.calls.pop()).toEqual({ method, args });
        }
    } finally {
        await s.close();
    }
});

test('field allowlists reject unrelated inputs on new and existing device operations', async () => {
    const s = await session();
    try {
        for (const [name, fields] of [
            ['manage_device', { operation: 'summary', deviceId: 'd1' }],
            ['manage_device', { operation: 'recordings_stop', deviceId: 'd1', recordingId: 'r1', quality: 1 }],
            ['manage_device', { operation: 'reboot', deviceId: 'd1', recordingId: 'r1' }],
            ['device_action', { operation: 'clipboard_get', deviceId: 'd1', x: 1 }],
            [
                'configure_device',
                { operation: 'kiosk_enable', deviceId: 'd1', packageName: 'example.app', locale: 'en' },
            ],
            [
                'manage_device_apps',
                {
                    operation: 'grant_permission',
                    deviceId: 'd1',
                    packageName: 'example.app',
                    permission: 'POST_NOTIFICATIONS',
                    activity: 'Main',
                },
            ],
            ['manage_esim', { operation: 'status', deviceId: 'd1', apnId: 2 }],
        ] as const) {
            const result = await s.client.callTool({ name, arguments: fields });
            expect(result.isError, `${name}.${fields.operation}`).toBe(true);
            expect((result.content as Array<{ text: string }>)[0]!.text).toContain('not valid for operation');
        }
        expect(s.calls).toEqual([]);
    } finally {
        await s.close();
    }
});

test('both screenshot tools return MCP PNG images', async () => {
    const s = await session();
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
        const s = await session(profile);
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
    const s = await session('full', true);
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
    const s = await session();
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
