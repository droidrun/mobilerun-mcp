import { describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer, ALL_TOOL_NAMES, fullAccessPolicy, type ToolCallEvent } from '../register.js';
import type { Backend } from '../backend/index.js';
import { BackendError } from '../backend/errors.js';
import { createAuthContext, type AuthContext, type ToolCtx } from '../ctx.js';

// A minimal stub Backend — every method returns a small tagged marker so
// assertions can confirm the right method was hit without caring about
// realistic payload shapes.
function stubBackend(): Backend & { calls: string[] } {
    const calls: string[] = [];
    // Loosely typed on purpose — this stub exists to assert which backend
    // method a tool dispatches to, not to model realistic DTO payloads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record = (name: string, result: unknown = { ok: true }): Promise<any> => {
        calls.push(name);
        return Promise.resolve(result);
    };
    const backend: Backend & { calls: string[] } = {
        calls,
        devices: {
            listDevices: () => record('devices.listDevices'),
            getDevice: () => record('devices.getDevice'),
            getDeviceScreenshot: () => record('devices.getDeviceScreenshot'),
            getDeviceUiState: () =>
                record('devices.getDeviceUiState', { a11y_tree: { children: [] }, phone_state: {} }),
            listAppsOnDevice: () => record('devices.listAppsOnDevice'),
            createDevice: () => record('devices.createDevice'),
            terminateDevice: () => record('devices.terminateDevice'),
        },
        workflows: {
            listActionCatalog: () => record('workflows.listActionCatalog'),
            getActionCatalogEntry: () => record('workflows.getActionCatalogEntry'),
            listAppEventCatalog: () => record('workflows.listAppEventCatalog'),
            listActions: () => record('workflows.listActions'),
            getAction: () => record('workflows.getAction'),
            createAction: () => record('workflows.createAction'),
            listTriggers: () => record('workflows.listTriggers'),
            getTrigger: () => record('workflows.getTrigger'),
            createTrigger: () => record('workflows.createTrigger'),
            listFlows: () => record('workflows.listFlows'),
            getFlow: () => record('workflows.getFlow'),
            createFlow: () => record('workflows.createFlow'),
            cloneFlow: () => record('workflows.cloneFlow'),
            unblockFlow: () => record('workflows.unblockFlow'),
            addFlowAction: () => record('workflows.addFlowAction'),
            removeFlowAction: () => record('workflows.removeFlowAction'),
            replaceFlowActions: () => record('workflows.replaceFlowActions'),
            listExecutions: () => record('workflows.listExecutions'),
            getExecution: () => record('workflows.getExecution'),
            getExecutionMetrics: () => record('workflows.getExecutionMetrics'),
            listServices: () => record('workflows.listServices'),
            listServiceMethods: () => record('workflows.listServiceMethods'),
            ingestEvent: () => record('workflows.ingestEvent', { eventId: 'evt_1' }),
            dryRunEvent: () => record('workflows.dryRunEvent'),
            registerEventTypes: () => record('workflows.registerEventTypes'),
        },
        webhooks: {
            createWebhook: () => record('webhooks.createWebhook'),
            listWebhooks: () => record('webhooks.listWebhooks'),
            getWebhook: () => record('webhooks.getWebhook'),
            updateWebhook: () => record('webhooks.updateWebhook'),
            rotateWebhookSecret: () => record('webhooks.rotateWebhookSecret'),
            testWebhook: () => record('webhooks.testWebhook'),
            listWebhookDeliveries: () => record('webhooks.listWebhookDeliveries'),
            getWebhookDelivery: () => record('webhooks.getWebhookDelivery'),
            getWebhookDeliveryStats: () => record('webhooks.getWebhookDeliveryStats'),
            listWebhookEventTypes: () => record('webhooks.listWebhookEventTypes'),
        },
        credentials: {
            listCredentials: () => record('credentials.listCredentials'),
            listCredentialPackages: () => record('credentials.listCredentialPackages'),
            initPackage: () => record('credentials.initPackage', { data: { packageName: 'p' }, message: 'ok', success: true }),
            createCredential: () =>
                record('credentials.createCredential', { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [] }, message: 'ok', success: true }),
            deleteCredential: () =>
                record('credentials.deleteCredential', { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [] }, message: 'ok', success: true }),
            addField: () =>
                record('credentials.addField', { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [{ fieldType: 'password' }] }, message: 'ok', success: true }),
            updateField: () =>
                record('credentials.updateField', { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [{ fieldType: 'password' }] }, message: 'ok', success: true }),
            deleteField: () =>
                record('credentials.deleteField', { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [] }, message: 'ok', success: true }),
        },
        apps: {
            listApps: () => record('apps.listApps'),
            getApp: () => record('apps.getApp'),
            listAppVersions: () => record('apps.listAppVersions'),
            createAppUploadUrl: () => record('apps.createAppUploadUrl'),
            confirmAppUpload: () => record('apps.confirmAppUpload'),
            markAppUploadFailed: () => record('apps.markAppUploadFailed'),
            deleteApp: () => record('apps.deleteApp'),
        },
        proxies: {
            listProxies: () => record('proxies.listProxies'),
            getProxy: () => record('proxies.getProxy'),
            createProxy: () => record('proxies.createProxy'),
            updateProxy: () => record('proxies.updateProxy'),
            deleteProxy: () => record('proxies.deleteProxy'),
            lookupProxy: () => record('proxies.lookupProxy'),
        },
        connect: {
            listCountries: () => record('connect.listCountries'),
            listConnectProxies: () => record('connect.listConnectProxies'),
            getConnectProxy: () => record('connect.getConnectProxy'),
            buyConnectProxy: () => record('connect.buyConnectProxy'),
            cancelConnectProxy: () => record('connect.cancelConnectProxy'),
            pingConnectProxy: () => record('connect.pingConnectProxy'),
            listConnectProxyConnections: () => record('connect.listConnectProxyConnections'),
            listConnectUsers: () => record('connect.listConnectUsers'),
            getConnectUser: () => record('connect.getConnectUser'),
            listConnectUserConnections: () => record('connect.listConnectUserConnections'),
        },
        platformCatalog: {
            listModels: () => record('platformCatalog.listModels'),
            listTimezones: () => record('platformCatalog.listTimezones'),
        },
        tasks: {
            runTask: () => record('tasks.runTask'),
            getTaskSummary: () => record('tasks.getTaskSummary'),
            getTaskStatus: () => record('tasks.getTaskStatus'),
            getTaskTrajectory: () => record('tasks.getTaskTrajectory', { events: [] }),
            listTasks: () => record('tasks.listTasks'),
            stopTask: () => record('tasks.stopTask'),
            sendTaskMessage: () => record('tasks.sendTaskMessage'),
            getTaskMedia: () => record('tasks.getTaskMedia'),
        },
        deviceControl: {
            rebootDevice: () => record('deviceControl.rebootDevice'),
            resetDevice: () => record('deviceControl.resetDevice'),
            renameDevice: () => record('deviceControl.renameDevice'),
            waitDeviceReady: () => record('deviceControl.waitDeviceReady'),
            getDeviceCapabilities: () => record('deviceControl.getDeviceCapabilities'),
            countDevices: () => record('deviceControl.countDevices'),
            tap: () => record('deviceControl.tap'),
            swipe: () => record('deviceControl.swipe'),
            keyboardWrite: () => record('deviceControl.keyboardWrite'),
            keyboardKey: () => record('deviceControl.keyboardKey'),
            keyboardClear: () => record('deviceControl.keyboardClear'),
            globalAction: () => record('deviceControl.globalAction'),
            installApp: () => record('deviceControl.installApp'),
            deleteApp: () => record('deviceControl.deleteApp'),
            startApp: () => record('deviceControl.startApp'),
            stopApp: () => record('deviceControl.stopApp'),
            listPackages: () => record('deviceControl.listPackages'),
            listFiles: () => record('deviceControl.listFiles'),
            uploadFile: () => record('deviceControl.uploadFile'),
            downloadFile: () => record('deviceControl.downloadFile', { content: 'ok' }),
            deleteFile: () => record('deviceControl.deleteFile'),
            getLanguage: () => record('deviceControl.getLanguage'),
            setLanguage: () => record('deviceControl.setLanguage'),
            getTimezone: () => record('deviceControl.getTimezone'),
            setTimezone: () => record('deviceControl.setTimezone'),
            getLocation: () => record('deviceControl.getLocation'),
            setLocation: () => record('deviceControl.setLocation'),
            getTime: () => record('deviceControl.getTime'),
            getOverlay: () => record('deviceControl.getOverlay'),
            setOverlay: () => record('deviceControl.setOverlay'),
            connectProxy: () => record('deviceControl.connectProxy'),
            disconnectProxy: () => record('deviceControl.disconnectProxy'),
            getProxyStatus: () => record('deviceControl.getProxyStatus'),
            listEsims: () => record('deviceControl.listEsims'),
            activateEsim: () => record('deviceControl.activateEsim'),
            enableEsim: () => record('deviceControl.enableEsim'),
            removeEsim: () => record('deviceControl.removeEsim'),
        },
        profiles: {
            listProfiles: () => record('profiles.listProfiles'),
            getProfile: () => record('profiles.getProfile'),
            createProfile: () => record('profiles.createProfile'),
            updateProfile: () => record('profiles.updateProfile'),
            deleteProfile: () => record('profiles.deleteProfile'),
            applyProfile: () => record('profiles.applyProfile'),
        },
    };
    return backend;
}

const testAuth: AuthContext = createAuthContext({ kind: 'api_key', subject: 'test-key' });

function ctxWith(backend: Backend, policyOverrides?: Partial<ToolCtx['policy']>): ToolCtx {
    return {
        backend,
        auth: testAuth,
        policy: { toolAllowlist: new Set(ALL_TOOL_NAMES), ...policyOverrides },
    };
}

async function connectedClient(ctx: ToolCtx, opts?: Parameters<typeof buildMcpServer>[1]) {
    const server = buildMcpServer(ctx, opts);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return { client, server };
}

const EXPECTED_TOOL_NAMES = [...ALL_TOOL_NAMES];

describe('buildMcpServer', () => {
    test('registers every tool in ALL_TOOL_NAMES (35 tools) under a full-access policy', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name).sort();
        expect(names).toEqual([...EXPECTED_TOOL_NAMES].sort());
        expect(tools).toHaveLength(EXPECTED_TOOL_NAMES.length);
    });

    test('fullAccessPolicy() matches ALL_TOOL_NAMES', () => {
        const policy = fullAccessPolicy();
        expect([...policy.toolAllowlist].sort()).toEqual([...ALL_TOOL_NAMES].sort());
    });

    test('empty policy registers nothing (fail-closed)', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient({ backend, auth: testAuth, policy: { toolAllowlist: new Set() } });
        const { tools } = await client.listTools();
        expect(tools).toHaveLength(0);
    });

    test('a denied tool is absent from tools/list AND uncallable (fail-closed at registration, not in the handler)', async () => {
        const backend = stubBackend();
        const allowlist = new Set(ALL_TOOL_NAMES.filter((n) => n !== 'terminate_device'));
        const { client } = await connectedClient(ctxWith(backend, { toolAllowlist: allowlist }));

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

    test('operation-level allow: webhooks operation in operationAllowlist dispatches normally', async () => {
        const backend = stubBackend();
        const ctx = ctxWith(backend, {
            operationAllowlist: new Map([['webhooks', new Set(['list', 'get'])]]),
        });
        const { client } = await connectedClient(ctx);

        const allowed = await client.callTool({ name: 'webhooks', arguments: { operation: 'list' } });
        expect(allowed.isError).not.toBe(true);
        expect(backend.calls).toContain('webhooks.listWebhooks');
    });

    test('operation-level denial: an operation outside operationAllowlist is rejected at dispatch, never reaching the backend', async () => {
        const backend = stubBackend();
        const ctx = ctxWith(backend, {
            // Input schema stays the FULL enum (see tools/webhooks.ts) — 'list' is
            // schema-valid, so this call reaches register.ts's dispatch-time gate,
            // which is where 'list' actually gets rejected for this credential.
            operationAllowlist: new Map([['webhooks', new Set(['get'])]]),
        });
        const { client } = await connectedClient(ctx);

        const denied = await client.callTool({ name: 'webhooks', arguments: { operation: 'list' } });
        expect(denied.isError).toBe(true);
        const text = (denied.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        expect(text).toContain('Operation "list" of tool "webhooks" is not available');
        expect(backend.calls).not.toContain('webhooks.listWebhooks');

        const allowed = await client.callTool({ name: 'webhooks', arguments: { operation: 'get', endpointId: '550e8400-e29b-41d4-a716-446655440000' } });
        expect(allowed.isError).not.toBe(true);
        expect(backend.calls).toContain('webhooks.getWebhook');
    });

    test('the webhooks tool description reflects the allowed operation subset', async () => {
        const backend = stubBackend();
        const ctx = ctxWith(backend, {
            operationAllowlist: new Map([['webhooks', new Set(['list', 'get'])]]),
        });
        const { client } = await connectedClient(ctx);
        const { tools } = await client.listTools();
        const webhooksTool = tools.find((t) => t.name === 'webhooks');
        expect(webhooksTool?.description).toContain('Available for this credential: list, get');
    });

    test('list_workflow_resources rejects a filter not allowed for the chosen resource', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

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

    test('webhooks tool dispatches each operation to the right backend method', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const cases: Array<{ args: Record<string, unknown>; expectMethod: string }> = [
            { args: { operation: 'create', url: 'https://example.com/hook' }, expectMethod: 'webhooks.createWebhook' },
            { args: { operation: 'list' }, expectMethod: 'webhooks.listWebhooks' },
            { args: { operation: 'get', endpointId: '550e8400-e29b-41d4-a716-446655440000' }, expectMethod: 'webhooks.getWebhook' },
            {
                args: { operation: 'update', endpointId: '550e8400-e29b-41d4-a716-446655440000', state: 'DISABLED' },
                expectMethod: 'webhooks.updateWebhook',
            },
            {
                args: { operation: 'rotate_secret', endpointId: '550e8400-e29b-41d4-a716-446655440000' },
                expectMethod: 'webhooks.rotateWebhookSecret',
            },
            { args: { operation: 'test', endpointId: '550e8400-e29b-41d4-a716-446655440000' }, expectMethod: 'webhooks.testWebhook' },
            {
                args: { operation: 'list_deliveries', endpointId: '550e8400-e29b-41d4-a716-446655440000' },
                expectMethod: 'webhooks.listWebhookDeliveries',
            },
            {
                args: {
                    operation: 'get_delivery',
                    endpointId: '550e8400-e29b-41d4-a716-446655440000',
                    deliveryId: '550e8400-e29b-41d4-a716-446655440001',
                },
                expectMethod: 'webhooks.getWebhookDelivery',
            },
            { args: { operation: 'delivery_stats' }, expectMethod: 'webhooks.getWebhookDeliveryStats' },
            { args: { operation: 'list_event_types' }, expectMethod: 'webhooks.listWebhookEventTypes' },
        ];

        for (const { args, expectMethod } of cases) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'webhooks', arguments: args });
            expect(result.isError).not.toBe(true);
            expect(backend.calls).toEqual([expectMethod]);
        }
    });


    test('manage_flow tool dispatches each operation to the right backend method', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const cases: Array<{ args: Record<string, unknown>; expectMethod: string }> = [
            { args: { operation: 'clone', flowId: 'flow-1' }, expectMethod: 'workflows.cloneFlow' },
            { args: { operation: 'unblock', flowId: 'flow-1' }, expectMethod: 'workflows.unblockFlow' },
            {
                args: { operation: 'add_action', flowId: 'flow-1', actionId: 'action-1', position: 1 },
                expectMethod: 'workflows.addFlowAction',
            },
            {
                args: { operation: 'remove_action', flowActionId: 'fa-1', flowId: 'flow-1' },
                expectMethod: 'workflows.removeFlowAction',
            },
            {
                args: { operation: 'replace_actions', flowId: 'flow-1', actions: [{ actionId: 'action-1', position: 1 }] },
                expectMethod: 'workflows.replaceFlowActions',
            },
            { args: { operation: 'execution_metrics' }, expectMethod: 'workflows.getExecutionMetrics' },
        ];

        for (const { args, expectMethod } of cases) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'manage_flow', arguments: args });
            expect(result.isError).not.toBe(true);
            expect(backend.calls).toEqual([expectMethod]);
        }
    });

    test('manage_flow requires flowId for clone/unblock/add_action/remove_action/replace_actions', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const result = await client.callTool({ name: 'manage_flow', arguments: { operation: 'unblock' } });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        expect(text).toContain('requires flowId');
        expect(backend.calls).not.toContain('workflows.unblockFlow');
    });

    test('workflow_events tool dispatches each operation to the right backend method', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const cases: Array<{ args: Record<string, unknown>; expectMethod: string }> = [
            { args: { operation: 'ingest', eventType: 'app.custom' }, expectMethod: 'workflows.ingestEvent' },
            { args: { operation: 'dry_run', eventType: 'app.custom' }, expectMethod: 'workflows.dryRunEvent' },
            { args: { operation: 'list_event_types' }, expectMethod: 'workflows.listAppEventCatalog' },
            {
                args: { operation: 'register_events', events: [{ eventType: 'app.custom', label: 'Custom' }] },
                expectMethod: 'workflows.registerEventTypes',
            },
        ];

        for (const { args, expectMethod } of cases) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'workflow_events', arguments: args });
            expect(result.isError).not.toBe(true);
            expect(backend.calls).toEqual([expectMethod]);
        }
    });

    test('workflow_events requires eventType for ingest/dry_run', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const result = await client.callTool({ name: 'workflow_events', arguments: { operation: 'ingest' } });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        expect(text).toContain('requires eventType');
        expect(backend.calls).not.toContain('workflows.ingestEvent');
    });

    test('list_workflow_resources dispatches service/service_methods, and service_methods requires the service filter', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const services = await client.callTool({ name: 'list_workflow_resources', arguments: { resource: 'service' } });
        expect(services.isError).not.toBe(true);
        expect(backend.calls).toContain('workflows.listServices');

        backend.calls.length = 0;
        const missingFilter = await client.callTool({ name: 'list_workflow_resources', arguments: { resource: 'service_methods' } });
        expect(missingFilter.isError).toBe(true);
        const text = (missingFilter.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        expect(text).toContain('requires filter: service');
        expect(backend.calls).not.toContain('workflows.listServiceMethods');

        backend.calls.length = 0;
        const withFilter = await client.callTool({
            name: 'list_workflow_resources',
            arguments: { resource: 'service_methods', service: 'tasks_api' },
        });
        expect(withFilter.isError).not.toBe(true);
        expect(backend.calls).toEqual(['workflows.listServiceMethods']);
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
        const { client } = await connectedClient(ctxWith(backend));

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

    test('apps tool dispatches each operation to the right backend method', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const appId = '550e8400-e29b-41d4-a716-446655440000';
        const cases: Array<{ args: Record<string, unknown>; expectMethod: string }> = [
            { args: { operation: 'list' }, expectMethod: 'apps.listApps' },
            { args: { operation: 'get', id: appId }, expectMethod: 'apps.getApp' },
            { args: { operation: 'versions', id: appId }, expectMethod: 'apps.listAppVersions' },
            {
                args: {
                    operation: 'create_upload_url',
                    bundleId: 'com.example.app',
                    displayName: 'Example',
                    versionCode: 1,
                    versionName: '1.0',
                    sizeBytes: 100,
                    files: [{ fileName: 'app.apk', contentType: 'application/vnd.android.package-archive' }],
                },
                expectMethod: 'apps.createAppUploadUrl',
            },
            { args: { operation: 'confirm_upload', id: appId }, expectMethod: 'apps.confirmAppUpload' },
            { args: { operation: 'mark_failed', id: appId }, expectMethod: 'apps.markAppUploadFailed' },
            { args: { operation: 'delete', id: appId }, expectMethod: 'apps.deleteApp' },
        ];

        for (const { args, expectMethod } of cases) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'apps', arguments: args });
            expect(result.isError).not.toBe(true);
            expect(backend.calls).toEqual([expectMethod]);
        }
    });

    test('apps operation=create_upload_url without required fields is rejected before dispatch', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const result = await client.callTool({ name: 'apps', arguments: { operation: 'create_upload_url' } });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        expect(text).toContain('requires bundleId');
        expect(backend.calls).not.toContain('apps.createAppUploadUrl');
    });

    test('manage_credentials tool dispatches each operation to the right backend method, never echoing a field value', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

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

    test('manage_credentials operation=add_field without a fieldType is rejected before dispatch', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const result = await client.callTool({
            name: 'manage_credentials',
            arguments: { operation: 'add_field', packageName: 'com.example', credentialName: 'main', value: 'x' },
        });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        expect(text).toContain('requires fieldType');
        expect(backend.calls).not.toContain('credentials.addField');
    });

    test('proxies tool dispatches each operation to the right backend method', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const cases: Array<{ args: Record<string, unknown>; expectMethod: string }> = [
            { args: { operation: 'list' }, expectMethod: 'proxies.listProxies' },
            { args: { operation: 'get', proxyId: 'p1' }, expectMethod: 'proxies.getProxy' },
            {
                args: { operation: 'create', protocol: 'socks5', name: 'n', host: 'h', port: 1080, user: 'u', password: 'pw' },
                expectMethod: 'proxies.createProxy',
            },
            {
                args: { operation: 'update', proxyId: 'p1', protocol: 'wireguard', name: 'n', config: 'cfg' },
                expectMethod: 'proxies.updateProxy',
            },
            { args: { operation: 'delete', proxyId: 'p1' }, expectMethod: 'proxies.deleteProxy' },
            { args: { operation: 'lookup', host: 'h', port: 1080 }, expectMethod: 'proxies.lookupProxy' },
        ];

        for (const { args, expectMethod } of cases) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'proxies', arguments: args });
            expect(result.isError).not.toBe(true);
            expect(backend.calls).toEqual([expectMethod]);
        }
    });

    test('connect tool dispatches each operation to the right backend method', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const cases: Array<{ args: Record<string, unknown>; expectMethod: string }> = [
            { args: { operation: 'list_countries' }, expectMethod: 'connect.listCountries' },
            { args: { operation: 'list_proxies' }, expectMethod: 'connect.listConnectProxies' },
            { args: { operation: 'get_proxy', proxyId: 'p1' }, expectMethod: 'connect.getConnectProxy' },
            { args: { operation: 'buy_proxy', country: 'us' }, expectMethod: 'connect.buyConnectProxy' },
            { args: { operation: 'cancel_proxy', proxyId: 'p1' }, expectMethod: 'connect.cancelConnectProxy' },
            { args: { operation: 'ping_proxy', proxyId: 'p1' }, expectMethod: 'connect.pingConnectProxy' },
            { args: { operation: 'list_connections', proxyId: 'p1' }, expectMethod: 'connect.listConnectProxyConnections' },
            { args: { operation: 'list_users' }, expectMethod: 'connect.listConnectUsers' },
            { args: { operation: 'get_user', userId: 'u1' }, expectMethod: 'connect.getConnectUser' },
            { args: { operation: 'list_user_connections', userId: 'u1' }, expectMethod: 'connect.listConnectUserConnections' },
        ];

        for (const { args, expectMethod } of cases) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'connect', arguments: args });
            expect(result.isError).not.toBe(true);
            expect(backend.calls).toEqual([expectMethod]);
        }
    });

    test('connect operation-level allowlist can deny buy_proxy/cancel_proxy independently of the rest of the bundle', async () => {
        const backend = stubBackend();
        const allowedOps = new Set([
            'list_countries',
            'list_proxies',
            'get_proxy',
            'ping_proxy',
            'list_connections',
            'list_users',
            'get_user',
            'list_user_connections',
        ]);
        const ctx = ctxWith(backend, { operationAllowlist: new Map([['connect', allowedOps]]) });
        const { client } = await connectedClient(ctx);

        const buy = await client.callTool({ name: 'connect', arguments: { operation: 'buy_proxy', country: 'us' } });
        expect(buy.isError).toBe(true);
        expect(backend.calls).not.toContain('connect.buyConnectProxy');

        const list = await client.callTool({ name: 'connect', arguments: { operation: 'list_proxies' } });
        expect(list.isError).not.toBe(true);
        expect(backend.calls).toContain('connect.listConnectProxies');
    });

    test('connect rejects create_user/update_user/delete_user at schema validation, not policy (removed 2026-08-12)', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        for (const removed of ['create_user', 'update_user', 'delete_user']) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'connect', arguments: { operation: removed, userId: 'u1' } });
            expect(result.isError).toBe(true);
            const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
            // Schema validation error, not the policy-gate's "not available for this credential" text.
            expect(text).not.toContain('not available for this credential');
            expect(backend.calls).toEqual([]);
        }
    });

    test('platform_catalog tool dispatches each catalog value to the right backend method', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const cases: Array<{ args: Record<string, unknown>; expectMethod: string }> = [
            { args: { catalog: 'models' }, expectMethod: 'platformCatalog.listModels' },
            { args: { catalog: 'timezones' }, expectMethod: 'platformCatalog.listTimezones' },
            { args: { catalog: 'app_event_types' }, expectMethod: 'workflows.listAppEventCatalog' },
        ];

        for (const { args, expectMethod } of cases) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'platform_catalog', arguments: args });
            expect(result.isError).not.toBe(true);
            expect(backend.calls).toEqual([expectMethod]);
        }
    });

    test('a BackendError thrown by the backend is rendered uniformly via asErrorResult', async () => {
        const backend = stubBackend();
        backend.devices.getDevice = () => Promise.reject(new BackendError('not_found', 'device d1 not found', 404));
        const { client } = await connectedClient(ctxWith(backend));

        const result = await client.callTool({ name: 'get_device', arguments: { deviceId: 'd1' } });
        expect(result.isError).toBe(true);
        const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
        expect(text).toBe('[not_found] device d1 not found');
    });

    test('get_workflow_resource preserves a BackendError (code + status) through its context-wrapping rethrow (Codex fix pack, 2026-08-12)', async () => {
        const backend = stubBackend();
        backend.workflows.getFlow = () => Promise.reject(new BackendError('not_found', 'flow f1 not found', 404));
        const { client } = await connectedClient(ctxWith(backend));

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
        const ctx = ctxWith(backend, {
            operationAllowlist: new Map([['webhooks', new Set(['list'])]]),
        });
        const { client } = await connectedClient(ctx, { onToolCall: (e) => events.push(e) });

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
