import { connect } from './connect.js';
import { stubBackend } from './backend-stub.js';
import { describe, expect, test } from 'bun:test';
import { ALL_TOOL_NAMES, type ToolCallEvent } from '../register.js';
import { BackendError } from '../backend/errors.js';
import { createAuthContext } from '../ctx.js';

const EXPECTED_TOOL_NAMES = [...ALL_TOOL_NAMES];

describe('buildMcpServer', () => {
    test('registers every tool in ALL_TOOL_NAMES under a full-access policy', async () => {
        const backend = stubBackend();
        const { client } = await connect('full', { backend });
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name).sort();
        expect(names).toEqual([...EXPECTED_TOOL_NAMES].sort());
        expect(tools).toHaveLength(EXPECTED_TOOL_NAMES.length);
    });

    test('empty policy registers nothing (fail-closed)', async () => {
        const backend = stubBackend();
        const { client } = await connect({ toolAllowlist: new Set() }, { backend });
        const { tools } = await client.listTools();
        expect(tools).toHaveLength(0);
    });

    test('a denied tool is absent from tools/list AND uncallable (fail-closed at registration, not in the handler)', async () => {
        const backend = stubBackend();
        const allowlist = new Set(ALL_TOOL_NAMES.filter((n) => n !== 'terminate_device'));
        const { client } = await connect({ toolAllowlist: allowlist }, { backend });

        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name).sort();
        expect(names).toEqual([...allowlist].sort());
        expect(tools).toHaveLength(ALL_TOOL_NAMES.length - 1);
        expect(names).not.toContain('terminate_device');

        // Calling it anyway must fail with the SDK's own generic "not found"
        // (there is no registered tool, so no handler of ours ever runs) —
        // NOT our old handler-level "not available for this credential" text,
        // which would imply the tool was registered and merely blocked.
        const result = await client.callTool({ name: 'terminate_device', arguments: { deviceId: 'd1' } });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        expect(text).toContain('not found');
        expect(backend.calls).not.toContain('devices.terminateDevice');
    });

    test('operation-level denial rejects operation, view and kind before dispatch', async () => {
        const rows = [
            { name: 'webhooks', field: 'operation', denied: 'list', allowed: 'get', args: { endpointId: '550e8400-e29b-41d4-a716-446655440000' }, method: 'webhooks.getWebhook' },
            { name: 'get_task', field: 'view', denied: 'trajectory', allowed: 'status', args: { taskId: 't1' }, method: 'tasks.getTaskStatus' },
            { name: 'get_task_media', field: 'kind', denied: 'ui_state', allowed: 'screenshot', args: { taskId: 't1' }, method: 'tasks.getTaskMedia' },
        ];
        const s = await connect({
            toolAllowlist: new Set(ALL_TOOL_NAMES),
            operationAllowlist: new Map(rows.map(({ name, allowed }) => [name, new Set([allowed])])),
        });
        for (const { name, field, denied, allowed, args, method } of rows) {
            s.calls.length = 0;
            const result = await s.client.callTool({ name, arguments: { ...args, [field]: denied } });
            expect(result.isError).toBe(true);
            expect((result.content as Array<{ text?: string }>)[0]?.text).toContain(`Operation "${denied}" of tool "${name}" is not available`);
            expect(s.calls).toEqual([]);
            expect((await s.client.callTool({ name, arguments: { ...args, [field]: allowed } })).isError).not.toBe(true);
            expect(s.calls).toEqual([method]);
        }
    });

    test('flow creation and add_action forward keys at positions zero and one', async () => {
        const s = await connect('full', { recordArgs: true });
        for (const position of [0, 1]) {
            const action = { actionId: 'action-1', position, key: 'fetch_profile' };
            for (const input of [
                { name: 'manage_flow', arguments: { operation: 'add_action', flowId: 'flow-1', ...action }, method: 'workflows.addFlowAction', expected: { flowId: 'flow-1', ...action } },
                { name: 'create_flow', arguments: { name: 'My flow', triggerId: 'trigger-1', actions: [action], deviceIds: ['device-1'] }, method: 'workflows.createFlow', expected: { actions: [action] } },
            ]) {
                s.calls.length = 0;
                expect((await s.client.callTool(input)).isError).not.toBe(true);
                expect(s.calls).toHaveLength(1);
                expect(s.calls[0]?.method).toBe(input.method);
                expect(s.calls[0]?.args[0]).toMatchObject(input.expected);
            }
        }
    });

    test('the webhooks tool description reflects the allowed operation subset', async () => {
        const backend = stubBackend();
        const policy = {
            toolAllowlist: new Set(ALL_TOOL_NAMES),
            operationAllowlist: new Map([['webhooks', new Set(['list', 'get'])]]),
        };
        const { client } = await connect(policy, { backend });
        const { tools } = await client.listTools();
        const webhooksTool = tools.find((t) => t.name === 'webhooks');
        expect(webhooksTool?.description).toContain('Available for this credential: list, get');
    });

    test('list_workflow_resources rejects a filter not allowed for the chosen resource', async () => {
        const backend = stubBackend();
        const { client } = await connect('full', { backend });

        // `enabled` is only valid for resource=flow, not resource=trigger.
        const result = await client.callTool({
            name: 'list_workflow_resources',
            arguments: { resource: 'trigger', enabled: true },
        });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        expect(text).toContain('not valid for resource=trigger');
        expect(backend.calls).not.toContain('workflows.listTriggers');

        const ok = await client.callTool({
            name: 'list_workflow_resources',
            arguments: { resource: 'trigger' },
        });
        expect(ok.isError).not.toBe(true);
        expect(backend.calls).toContain('workflows.listTriggers');
    });

    test('manage_flow replace_actions on a 0-based flow carries over keys by position + actionId when key/flowActionId are omitted', async () => {
        const backend = stubBackend();
        backend.workflows.listFlowActions = () =>
            Promise.resolve({
                items: [
                    { id: 'fa-1', key: 'a_key', actionId: 'action-a', position: 0, parentFlowActionId: null },
                    { id: 'fa-2', key: 'b_key', actionId: 'action-b', position: 1, parentFlowActionId: null },
                ],
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
        let replaceArgs: unknown;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (backend.workflows as any).replaceFlowActions = (params: unknown) => {
            replaceArgs = params;
            backend.calls.push('workflows.replaceFlowActions');
            return Promise.resolve({ items: [] });
        };
        const { client } = await connect('full', { backend });

        const result = await client.callTool({
            name: 'manage_flow',
            arguments: {
                operation: 'replace_actions',
                flowId: 'flow-1',
                actions: [
                    { actionId: 'action-a', position: 0 },
                    { actionId: 'action-b', position: 1 },
                ],
            },
        });

        expect(result.isError).not.toBe(true);
        expect(replaceArgs).toMatchObject({
            flowId: 'flow-1',
            actions: [
                { actionId: 'action-a', position: 0, key: 'a_key' },
                { actionId: 'action-b', position: 1, key: 'b_key' },
            ],
        });
    });

    test('assistant defaults send wait to 45 seconds', async () => {
        const backend = stubBackend();
        const sendCalls: Array<[string, string, number]> = [];
        backend.assistant.sendMessage = async (sessionId, message, waitSeconds) => {
            sendCalls.push([sessionId, message, waitSeconds]);
            return { status: 'completed', chatSessionId: sessionId, assistantText: 'done' };
        };
        const { client } = await connect('full', { backend });
        const sent = await client.callTool({ name: 'assistant', arguments: { operation: 'send_message', sessionId: 's1', message: 'Hi' } });
        expect(sent.isError).not.toBe(true);
        expect(sendCalls).toEqual([['s1', 'Hi', 45]]);

        backend.calls.length = 0;
        const always = await client.callTool({ name: 'assistant', arguments: { operation: 'answer_permission', permissionId: 'p1', response: 'always' } });
        expect(always.isError).toBe(true);
        expect(backend.calls).toEqual([]);
    });

    test('webhooks get/list outputs never contain a secret field; create/rotate_secret outputs do', async () => {
        const backend = stubBackend();
        const withoutSecret = { data: { id: 'wh-1', url: 'https://example.com', state: 'ACTIVE' } };
        const withSecret = { data: { id: 'wh-1', url: 'https://example.com', state: 'ACTIVE', secret: 'whsec_shown_once' } };
        backend.webhooks.getWebhook = () => Promise.resolve(withoutSecret as never);
        backend.webhooks.listWebhooks = () => Promise.resolve({ items: [withoutSecret.data], pagination: {} } as never);
        backend.webhooks.updateWebhook = () => Promise.resolve(withoutSecret as never);
        backend.webhooks.createWebhook = () => Promise.resolve(withSecret as never);
        backend.webhooks.rotateWebhookSecret = () => Promise.resolve(withSecret as never);
        const { client } = await connect('full', { backend });

        const getResult = await client.callTool({ name: 'webhooks', arguments: { operation: 'get', endpointId: '550e8400-e29b-41d4-a716-446655440000' } });
        expect(((getResult.content as Array<{ type: string; text?: string }>)[0]?.text ?? '')).not.toContain('secret');

        const listResult = await client.callTool({ name: 'webhooks', arguments: { operation: 'list' } });
        expect(((listResult.content as Array<{ type: string; text?: string }>)[0]?.text ?? '')).not.toContain('secret');

        const updateResult = await client.callTool({
            name: 'webhooks',
            arguments: { operation: 'update', endpointId: '550e8400-e29b-41d4-a716-446655440000', state: 'DISABLED' },
        });
        expect(((updateResult.content as Array<{ type: string; text?: string }>)[0]?.text ?? '')).not.toContain('secret');

        const createResult = await client.callTool({ name: 'webhooks', arguments: { operation: 'create', url: 'https://example.com/hook' } });
        expect(((createResult.content as Array<{ type: string; text?: string }>)[0]?.text ?? '')).toContain('whsec_shown_once');

        const rotateResult = await client.callTool({
            name: 'webhooks',
            arguments: { operation: 'rotate_secret', endpointId: '550e8400-e29b-41d4-a716-446655440000' },
        });
        expect(((rotateResult.content as Array<{ type: string; text?: string }>)[0]?.text ?? '')).toContain('whsec_shown_once');
    });

    test.each([undefined, 'com.example'])('list_credentials returns metadata only (packageName=%s)', async (packageName) => {
        const metadata = {
            items: [{
                credentialName: 'main', packageName: 'com.example', userId: 'user-1', secretPath: 'credentials/main',
                fields: [{ fieldType: 'password' as const }],
            }],
        };
        const { client, calls } = await connect('full', {
            recordArgs: true,
            responses: { 'credentials.listCredentials': metadata },
        });

        const result = await client.callTool({ name: 'list_credentials', arguments: packageName ? { packageName } : {} });

        expect(result.isError).not.toBe(true);
        expect(calls).toEqual([{ method: 'credentials.listCredentials', args: [packageName] }]);
        const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        expect(JSON.parse(text)).toEqual(metadata);
        expect(text).not.toMatch(/"value"\s*:/);
    });

    test('manage_credentials tool dispatches each operation to the right backend method, never echoing a field value', async () => {
        const backend = stubBackend();
        const { client } = await connect('full', { backend });

        const cases: Array<{ args: Record<string, unknown>; expectMethod: string }> = [
            { args: { operation: 'init_package', packageName: 'com.example' }, expectMethod: 'credentials.initPackage' },
            {
                args: {
                    operation: 'create_credential',
                    packageName: 'com.example',
                    credentialName: 'main',
                    fields: [{ fieldType: 'password', value: 'super-secret-value' }],
                },
                expectMethod: 'credentials.createCredential',
            },
            {
                args: { operation: 'delete_credential', packageName: 'com.example', credentialName: 'main' },
                expectMethod: 'credentials.deleteCredential',
            },
            {
                args: { operation: 'add_field', packageName: 'com.example', credentialName: 'main', fieldType: 'password', value: 'super-secret-value' },
                expectMethod: 'credentials.addField',
            },
            {
                args: { operation: 'update_field', packageName: 'com.example', credentialName: 'main', fieldType: 'password', value: 'super-secret-value' },
                expectMethod: 'credentials.updateField',
            },
            {
                args: { operation: 'delete_field', packageName: 'com.example', credentialName: 'main', fieldType: 'password' },
                expectMethod: 'credentials.deleteField',
            },
        ];

        for (const { args, expectMethod } of cases) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'manage_credentials', arguments: args });
            expect(result.isError).not.toBe(true);
            expect(backend.calls).toEqual([expectMethod]);
            const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
            expect(text).not.toContain('super-secret-value');
            expect(text).not.toContain('"value"');
        }
    });

    test('a BackendError thrown by the backend is rendered uniformly via asErrorResult', async () => {
        const backend = stubBackend();
        backend.devices.getDevice = () => Promise.reject(new BackendError('not_found', 'device d1 not found', 404));
        const { client } = await connect('full', { backend });

        const result = await client.callTool({ name: 'get_device', arguments: { deviceId: 'd1' } });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        expect(text).toBe('[not_found] device d1 not found');
    });

    test('get_workflow_resource preserves a BackendError (code + status) through its context-wrapping rethrow (Codex fix pack, 2026-08-12)', async () => {
        const backend = stubBackend();
        backend.workflows.getFlow = () => Promise.reject(new BackendError('not_found', 'flow f1 not found', 404));
        const { client } = await connect('full', { backend });

        const result = await client.callTool({ name: 'get_workflow_resource', arguments: { resource: 'flow', id: 'f1' } });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        // Must still be the typed `[not_found] ...` shape (asErrorResult only
        // renders that for `err instanceof BackendError`) — a plain Error
        // rethrow here would fall through to the raw message with no code,
        // or even escape as an uncaught protocol error.
        expect(text).toBe('[not_found] flow f1: flow f1 not found');

        backend.workflows.getTrigger = () => Promise.reject(new BackendError('forbidden', 'no access to trigger t1', 403));
        const forbidden = await client.callTool({ name: 'get_workflow_resource', arguments: { resource: 'trigger', id: 't1' } });
        expect(forbidden.isError).toBe(true);
        const forbiddenText = (forbidden.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        expect(forbiddenText).toBe('[forbidden] trigger t1: no access to trigger t1');
    });

    test('createAuthContext requires ownerId for oauth/machine, not for api_key', () => {
        expect(() => createAuthContext({ kind: 'oauth', subject: 'u1' })).toThrow();
        expect(() => createAuthContext({ kind: 'machine', subject: 'm1' })).toThrow();
        expect(createAuthContext({ kind: 'api_key', subject: 'k1' }).ownerId).toBeUndefined();
        expect(createAuthContext({ kind: 'oauth', subject: 'u1', ownerId: 'org1' }).ownerId).toBe('org1');
    });

    test('onToolCall reports ok/error/denied outcomes with non-sensitive auth attrs, never args', async () => {
        const backend = stubBackend();
        const events: ToolCallEvent[] = [];
        const policy = {
            toolAllowlist: new Set(ALL_TOOL_NAMES),
            operationAllowlist: new Map([['webhooks', new Set(['list'])]]),
        };
        const { client } = await connect(policy, { backend, serverOptions: { onToolCall: (e) => events.push(e) } });

        await client.callTool({ name: 'list_devices', arguments: {} });
        await client.callTool({ name: 'webhooks', arguments: { operation: 'get', endpointId: '550e8400-e29b-41d4-a716-446655440000' } });

        const listDevicesEvent = events.find((e) => e.toolName === 'list_devices');
        expect(listDevicesEvent?.outcome).toBe('ok');
        expect(listDevicesEvent?.auth).toEqual({ kind: 'api_key', subject: 'test-key', ownerId: undefined, clientId: undefined });

        const deniedEvent = events.find((e) => e.toolName === 'webhooks' && e.outcome === 'denied');
        expect(deniedEvent).toBeDefined();
        expect(deniedEvent?.operation).toBe('get');

        for (const e of events) {
            expect(JSON.stringify(e)).not.toContain('endpointId');
        }
    });
});
