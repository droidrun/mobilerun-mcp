import { BUNDLE_TOOLS } from '../tools/bundle-tools.js';
import { stubBackend } from './backend-stub.js';
// The three server-start policy profiles. `no-commerce` is the REQUIRED safe default
// (a public server that forgets to set a profile must never fail open to
// `full`); `readonly` must hide every mutation, including at the
// `webhooks` bundle's operation level.

import { describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { type Backend } from '../backend/index.js';
import { createAuthContext } from '../ctx.js';
import { ALL_TOOL_NAMES, buildMcpServer } from '../register.js';
import { policyForProfile } from '../policies.js';

const testAuth = createAuthContext({ kind: 'api_key', subject: 'test-key' });

async function connectedClient(backend: Backend, profile: Parameters<typeof policyForProfile>[0]) {
    const server = buildMcpServer({ backend, auth: testAuth, policy: policyForProfile(profile) });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return client;
}

describe('policyForProfile', () => {
    test('"full" registers all 39 tools', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'full');
        const { tools } = await client.listTools();
        expect(tools).toHaveLength(39);
        expect(tools.map((t) => t.name).sort()).toEqual([...ALL_TOOL_NAMES].sort());
    });

    test('"no-commerce" (the required safe default) hides create_device and terminate_device only', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'no-commerce');
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name).sort();
        expect(names).not.toContain('create_device');
        expect(names).not.toContain('terminate_device');
        expect(tools).toHaveLength(37);
        expect(names).toEqual(
            [...ALL_TOOL_NAMES].filter((n) => n !== 'create_device' && n !== 'terminate_device').sort(),
        );

        // Everything else, including other mutations, stays reachable.
        const created = await client.callTool({
            name: 'create_action',
            arguments: { catalogEntryId: 'c1', name: 'a' },
        });
        expect(created.isError).not.toBe(true);
        expect(backend.calls).toContain('workflows.createAction');
    });

    test('"readonly" hides standalone mutations and narrows mixed bundles', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'readonly');
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name).sort();
        expect(tools).toHaveLength(31);

        for (const denied of [
            'create_device',
            'terminate_device',
            'create_action',
            'create_trigger',
            'create_flow',
            'run_task',
            'stop_task',
            'send_task_message',
        ]) {
            expect(names).not.toContain(denied);
        }

        expect(names).toEqual(
            [
                'assistant',
                'apps',
                'configure_device',
                'connect',
                'get_device',
                'get_device_screenshot',
                'get_device_ui_state',
                'get_task',
                'get_task_media',
                'get_workflow_resource',
                'list_apps_on_device',
                'list_credential_packages',
                'list_credentials',
                'list_devices',
                'list_tasks',
                'list_workflow_resources',
                'manage_device',
                'manage_device_apps',
                'manage_device_files',
                'manage_esim',
                'manage_flow',
                'platform_catalog',
                'proxies',
                'webhooks',
                'workflow_events',
                'numbers',
                'mailboxes',
                'messages',
                'files',
                'device_action',
                'manage_credentials',
            ].sort(),
        );
    });

    test('"readonly" allows only read webhooks operations, denying mutations at dispatch time', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'readonly');

        const list = await client.callTool({ name: 'webhooks', arguments: { operation: 'list' } });
        expect(list.isError).not.toBe(true);
        expect(backend.calls).toContain('webhooks.listWebhooks');

        for (const mutating of ['create', 'update', 'rotate_secret', 'test']) {
            backend.calls.length = 0;
            const result = await client.callTool({
                name: 'webhooks',
                arguments: {
                    operation: mutating,
                    url: 'https://example.com/hook',
                    endpointId: '550e8400-e29b-41d4-a716-446655440000',
                },
            });
            expect(result.isError).toBe(true);
            const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
            expect(text).toContain(`Operation "${mutating}" of tool "webhooks" is not available`);
            expect(backend.calls).toEqual([]);
        }
    });

    test('"readonly" narrows assistant to session listing and history', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'readonly');
        const listed = await client.callTool({ name: 'assistant', arguments: { operation: 'list_sessions' } });
        expect(listed.isError).not.toBe(true);
        const history = await client.callTool({
            name: 'assistant',
            arguments: { operation: 'get_messages', sessionId: 's1' },
        });
        expect(history.isError).not.toBe(true);
        expect(backend.calls).toContain('assistant.listSessions');
        expect(backend.calls).toContain('assistant.getMessages');

        backend.calls.length = 0;
        const denied = await client.callTool({
            name: 'assistant',
            arguments: { operation: 'send_message', sessionId: 's1', message: 'Hi' },
        });
        expect(denied.isError).toBe(true);
        expect((denied.content as Array<{ text?: string }>)[0]?.text).toContain(
            'Operation "send_message" of tool "assistant" is not available',
        );
        expect(backend.calls).toEqual([]);
    });

    test('"readonly" leaves list_workflow_resources / get_workflow_resource fully available (all resource values)', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'readonly');

        const flow = await client.callTool({ name: 'list_workflow_resources', arguments: { resource: 'flow' } });
        expect(flow.isError).not.toBe(true);
        expect(backend.calls).toContain('workflows.listFlows');

        const execution = await client.callTool({
            name: 'get_workflow_resource',
            arguments: { resource: 'execution', id: 'e1' },
        });
        expect(execution.isError).not.toBe(true);
        expect(backend.calls).toContain('workflows.getExecution');
    });

    test('"readonly" allows only read manage_device operations, denying reboot/reset/rename at dispatch time', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'readonly');

        const count = await client.callTool({ name: 'manage_device', arguments: { operation: 'count' } });
        expect(count.isError).not.toBe(true);
        expect(backend.calls).toContain('deviceControl.countDevices');

        for (const mutating of ['reboot', 'reset', 'rename']) {
            backend.calls.length = 0;
            const result = await client.callTool({
                name: 'manage_device',
                arguments: { operation: mutating, deviceId: 'd1' },
            });
            expect(result.isError).toBe(true);
            const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
            expect(text).toContain(`Operation "${mutating}" of tool "manage_device" is not available`);
            expect(backend.calls).toEqual([]);
        }
    });

    test('"readonly" allows only read connect operations, denying buy_proxy/cancel_proxy', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'readonly');

        const listCountries = await client.callTool({ name: 'connect', arguments: { operation: 'list_countries' } });
        expect(listCountries.isError).not.toBe(true);
        expect(backend.calls).toContain('connect.listCountries');

        for (const mutating of ['buy_proxy', 'cancel_proxy']) {
            backend.calls.length = 0;
            const result = await client.callTool({
                name: 'connect',
                arguments: { operation: mutating, country: 'us', proxyId: 'p1', userId: 'u1' },
            });
            expect(result.isError).toBe(true);
            expect(backend.calls).toEqual([]);
        }
    });

    test('"no-commerce" allows connect but denies buy_proxy/cancel_proxy at dispatch time', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'no-commerce');
        const { tools } = await client.listTools();
        expect(tools.map((t) => t.name)).toContain('connect');

        const listProxies = await client.callTool({ name: 'connect', arguments: { operation: 'list_proxies' } });
        expect(listProxies.isError).not.toBe(true);
        expect(backend.calls).toContain('connect.listConnectProxies');

        for (const denied of ['buy_proxy', 'cancel_proxy']) {
            backend.calls.length = 0;
            const result = await client.callTool({
                name: 'connect',
                arguments: { operation: denied, country: 'us', proxyId: 'p1' },
            });
            expect(result.isError).toBe(true);
            const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
            expect(text).toContain(`Operation "${denied}" of tool "connect" is not available`);
            expect(backend.calls).toEqual([]);
        }
    });

    test('"no-commerce" exposes assistant reads but denies assistant writes at dispatch time', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'no-commerce');

        for (const args of [{ operation: 'list_sessions' }, { operation: 'get_messages', sessionId: 's1' }]) {
            const result = await client.callTool({ name: 'assistant', arguments: args });
            expect(result.isError).not.toBe(true);
        }
        expect(backend.calls).toContain('assistant.listSessions');
        expect(backend.calls).toContain('assistant.getMessages');

        for (const args of [
            { operation: 'send_message', sessionId: 's1', message: 'Hi' },
            { operation: 'answer_permission', permissionId: 'p1', response: 'once' },
            { operation: 'create_session', title: 'Chat' },
        ]) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'assistant', arguments: args });
            expect(result.isError).toBe(true);
            expect((result.content as Array<{ text?: string }>)[0]?.text).toContain('is not available');
            expect(backend.calls).toEqual([]);
        }
    });

    test('"full" allows assistant send_message', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'full');
        const result = await client.callTool({
            name: 'assistant',
            arguments: { operation: 'send_message', sessionId: 's1', message: 'Hi' },
        });
        expect(result.isError).not.toBe(true);
        expect(backend.calls).toContain('assistant.sendMessage');
    });
});

test('no-commerce blocks flow activation through update before any backend call', async () => {
    const backend = stubBackend();
    const client = await connectedClient(backend, 'no-commerce');
    try {
        for (const fields of [
            { enabled: true },
            { lifecycleStatus: 'enabled' },
            { enabled: false, lifecycleStatus: 'enabled' },
        ]) {
            const result = await client.callTool({
                name: 'manage_flow',
                arguments: { operation: 'update', flowId: 'f1', ...fields },
            });
            expect(result.isError).toBe(true);
            expect((result.content as Array<{ text: string }>)[0]!.text).toContain('not available for this credential');
            expect(backend.calls).toEqual([]);
        }
        for (const fields of [{ enabled: false }, { lifecycleStatus: 'disabled' }, { name: 'Renamed' }]) {
            const result = await client.callTool({
                name: 'manage_flow',
                arguments: { operation: 'update', flowId: 'f1', ...fields },
            });
            expect(result.isError).not.toBe(true);
        }
        expect(backend.calls).toEqual(Array(3).fill('workflows.manageFlowUpdate'));
    } finally {
        await client.close();
    }
});

test('full permits activation through flow update', async () => {
    const backend = stubBackend();
    const client = await connectedClient(backend, 'full');
    try {
        const result = await client.callTool({
            name: 'manage_flow',
            arguments: { operation: 'update', flowId: 'f1', enabled: true },
        });
        expect(result.isError).not.toBe(true);
        expect(backend.calls).toEqual(['workflows.manageFlowUpdate']);
    } finally {
        await client.close();
    }
});

test('no-commerce permits event simulation and denies ingest before dispatch', async () => {
    const backend = stubBackend();
    const client = await connectedClient(backend, 'no-commerce');
    try {
        const tool = (await client.listTools()).tools.find((tool) => tool.name === 'workflow_events')!;
        expect(tool.description).toContain('Available for this credential: dry_run.');
        const ingest = await client.callTool({
            name: 'workflow_events',
            arguments: { operation: 'ingest', eventType: 'example', payload: {} },
        });
        expect(ingest.isError).toBe(true);
        expect((ingest.content as Array<{ text: string }>)[0]!.text).toContain('not available for this credential');
        expect(backend.calls).toEqual([]);
        const dryRun = await client.callTool({
            name: 'workflow_events',
            arguments: { operation: 'dry_run', eventType: 'example', payload: {} },
        });
        expect(dryRun.isError).not.toBe(true);
        expect(backend.calls).toEqual(['workflows.dryRunEvent']);
    } finally {
        await client.close();
    }
});

test('every enumerated tool operation has one complete table classification', async () => {
    const client = await connectedClient(stubBackend(), 'full');
    try {
        const { tools } = await client.listTools();
        const selectorFields = new Set(Object.values(BUNDLE_TOOLS).map(({ field }) => field));
        const enumeratedTools = tools.filter((tool) =>
            Object.entries(tool.inputSchema.properties ?? {}).some(
                ([field, schema]) =>
                    selectorFields.has(field as (typeof BUNDLE_TOOLS)[keyof typeof BUNDLE_TOOLS]['field']) &&
                    Array.isArray((schema as { enum?: unknown }).enum),
            ),
        );
        expect(enumeratedTools.map(({ name }) => name).sort()).toEqual(Object.keys(BUNDLE_TOOLS).sort());
        for (const [name, { field, operations }] of Object.entries(BUNDLE_TOOLS)) {
            const tool = tools.find((tool) => tool.name === name)!;
            const schema = tool.inputSchema.properties![field] as { enum: string[] };
            expect(schema.enum).toEqual(operations.map(({ op }) => op));
            expect(new Set(operations.map(({ op }) => op)).size).toBe(operations.length);
            for (const operation of operations) {
                expect(['read', 'write', 'commerce']).toContain(operation.access);
            }
        }
        for (const [profile, count] of [
            ['readonly', 31],
            ['no-commerce', 37],
            ['full', 39],
        ] as const) {
            expect(policyForProfile(profile).toolAllowlist.size).toBe(count);
        }
    } finally {
        await client.close();
    }
});
