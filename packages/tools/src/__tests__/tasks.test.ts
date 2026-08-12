import { describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer, ALL_TOOL_NAMES } from '../register.js';
import type { Backend } from '../backend/index.js';
import { createAuthContext, type AuthContext, type ToolCtx } from '../ctx.js';
import { compactTrajectory } from '../tools/tasks.js';

// Minimal stub Backend — mirrors register.test.ts's stubBackend but records
// call arguments too, since these tests assert on param passthrough
// (run_task) and dispatch targets (view/kind enum -> backend method), not
// just "some backend method was hit".
function stubBackend(): Backend & { calls: Array<{ method: string; args: unknown[] }> } {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    // Loosely typed on purpose, same rationale as register.test.ts's stubBackend
    // — this exists to assert dispatch target + passthrough args, not to model
    // realistic DTO payloads.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record = (method: string, result: unknown = { ok: true }): ((...args: unknown[]) => Promise<any>) => {
        return (...args: unknown[]) => {
            calls.push({ method, args });
            return Promise.resolve(result);
        };
    };
    const backend: Backend & { calls: Array<{ method: string; args: unknown[] }> } = {
        devices: {
            listDevices: record('devices.listDevices'),
            getDevice: record('devices.getDevice'),
            getDeviceScreenshot: record('devices.getDeviceScreenshot'),
            getDeviceUiState: record('devices.getDeviceUiState', { a11y_tree: { children: [] }, phone_state: {} }),
            listAppsOnDevice: record('devices.listAppsOnDevice'),
            createDevice: record('devices.createDevice'),
            terminateDevice: record('devices.terminateDevice'),
        },
        workflows: {
            listActionCatalog: record('workflows.listActionCatalog'),
            getActionCatalogEntry: record('workflows.getActionCatalogEntry'),
            listAppEventCatalog: record('workflows.listAppEventCatalog'),
            listActions: record('workflows.listActions'),
            getAction: record('workflows.getAction'),
            createAction: record('workflows.createAction'),
            listTriggers: record('workflows.listTriggers'),
            getTrigger: record('workflows.getTrigger'),
            createTrigger: record('workflows.createTrigger'),
            listFlows: record('workflows.listFlows'),
            getFlow: record('workflows.getFlow'),
            createFlow: record('workflows.createFlow'),
            cloneFlow: record('workflows.cloneFlow'),
            unblockFlow: record('workflows.unblockFlow'),
            addFlowAction: record('workflows.addFlowAction'),
            removeFlowAction: record('workflows.removeFlowAction'),
            replaceFlowActions: record('workflows.replaceFlowActions'),
            listExecutions: record('workflows.listExecutions'),
            getExecution: record('workflows.getExecution'),
            getExecutionMetrics: record('workflows.getExecutionMetrics'),
            listServices: record('workflows.listServices'),
            listServiceMethods: record('workflows.listServiceMethods'),
            ingestEvent: record('workflows.ingestEvent', { eventId: 'evt_1' }),
            dryRunEvent: record('workflows.dryRunEvent'),
            registerEventTypes: record('workflows.registerEventTypes'),
        },
        webhooks: {
            createWebhook: record('webhooks.createWebhook'),
            listWebhooks: record('webhooks.listWebhooks'),
            getWebhook: record('webhooks.getWebhook'),
            updateWebhook: record('webhooks.updateWebhook'),
            rotateWebhookSecret: record('webhooks.rotateWebhookSecret'),
            testWebhook: record('webhooks.testWebhook'),
            listWebhookDeliveries: record('webhooks.listWebhookDeliveries'),
            getWebhookDelivery: record('webhooks.getWebhookDelivery'),
            getWebhookDeliveryStats: record('webhooks.getWebhookDeliveryStats'),
            listWebhookEventTypes: record('webhooks.listWebhookEventTypes'),
        },
        credentials: {
            listCredentials: record('credentials.listCredentials'),
            listCredentialPackages: record('credentials.listCredentialPackages'),
            initPackage: record('credentials.initPackage', { data: { packageName: 'p' }, message: 'ok', success: true }),
            createCredential: record('credentials.createCredential', { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [] }, message: 'ok', success: true }),
            deleteCredential: record('credentials.deleteCredential', { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [] }, message: 'ok', success: true }),
            addField: record('credentials.addField', { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [{ fieldType: 'password' }] }, message: 'ok', success: true }),
            updateField: record('credentials.updateField', { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [{ fieldType: 'password' }] }, message: 'ok', success: true }),
            deleteField: record('credentials.deleteField', { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [] }, message: 'ok', success: true }),
        },
        apps: {
            listApps: record('apps.listApps'),
            getApp: record('apps.getApp'),
            listAppVersions: record('apps.listAppVersions'),
            createAppUploadUrl: record('apps.createAppUploadUrl'),
            confirmAppUpload: record('apps.confirmAppUpload'),
            markAppUploadFailed: record('apps.markAppUploadFailed'),
            deleteApp: record('apps.deleteApp'),
        },
        proxies: {
            listProxies: record('proxies.listProxies'),
            getProxy: record('proxies.getProxy'),
            createProxy: record('proxies.createProxy'),
            updateProxy: record('proxies.updateProxy'),
            deleteProxy: record('proxies.deleteProxy'),
            lookupProxy: record('proxies.lookupProxy'),
        },
        connect: {
            listCountries: record('connect.listCountries'),
            listConnectProxies: record('connect.listConnectProxies'),
            getConnectProxy: record('connect.getConnectProxy'),
            buyConnectProxy: record('connect.buyConnectProxy'),
            cancelConnectProxy: record('connect.cancelConnectProxy'),
            pingConnectProxy: record('connect.pingConnectProxy'),
            listConnectProxyConnections: record('connect.listConnectProxyConnections'),
            listConnectUsers: record('connect.listConnectUsers'),
            getConnectUser: record('connect.getConnectUser'),
            listConnectUserConnections: record('connect.listConnectUserConnections'),
        },
        platformCatalog: {
            listModels: record('platformCatalog.listModels'),
            listTimezones: record('platformCatalog.listTimezones'),
        },
        tasks: {
            runTask: record('tasks.runTask', { id: 't1', status: 'queued' }),
            getTaskSummary: record('tasks.getTaskSummary', { deviceId: 'd1', llmModel: 'x', task: 't', userId: 'u1' }),
            getTaskStatus: record('tasks.getTaskStatus', { status: 'running' }),
            getTaskTrajectory: record('tasks.getTaskTrajectory', { events: [{ event: 'QueuedEvent', data: { id: 't1' } }] }),
            listTasks: record('tasks.listTasks', { items: [], pagination: { page: 1, pages: 1, pageSize: 20, total: 0, hasNext: false, hasPrev: false }, deviceScoped: false }),
            stopTask: record('tasks.stopTask', { cancelled: true }),
            sendTaskMessage: record('tasks.sendTaskMessage', { sent: true }),
            getTaskMedia: record('tasks.getTaskMedia', { urls: [] }),
        },
        deviceControl: {
            rebootDevice: record('deviceControl.rebootDevice'),
            resetDevice: record('deviceControl.resetDevice'),
            renameDevice: record('deviceControl.renameDevice'),
            waitDeviceReady: record('deviceControl.waitDeviceReady'),
            getDeviceCapabilities: record('deviceControl.getDeviceCapabilities'),
            countDevices: record('deviceControl.countDevices'),
            tap: record('deviceControl.tap'),
            swipe: record('deviceControl.swipe'),
            keyboardWrite: record('deviceControl.keyboardWrite'),
            keyboardKey: record('deviceControl.keyboardKey'),
            keyboardClear: record('deviceControl.keyboardClear'),
            globalAction: record('deviceControl.globalAction'),
            installApp: record('deviceControl.installApp'),
            deleteApp: record('deviceControl.deleteApp'),
            startApp: record('deviceControl.startApp'),
            stopApp: record('deviceControl.stopApp'),
            listPackages: record('deviceControl.listPackages'),
            listFiles: record('deviceControl.listFiles'),
            uploadFile: record('deviceControl.uploadFile'),
            downloadFile: record('deviceControl.downloadFile', { content: 'ok' }),
            deleteFile: record('deviceControl.deleteFile'),
            getLanguage: record('deviceControl.getLanguage'),
            setLanguage: record('deviceControl.setLanguage'),
            getTimezone: record('deviceControl.getTimezone'),
            setTimezone: record('deviceControl.setTimezone'),
            getLocation: record('deviceControl.getLocation'),
            setLocation: record('deviceControl.setLocation'),
            getTime: record('deviceControl.getTime'),
            getOverlay: record('deviceControl.getOverlay'),
            setOverlay: record('deviceControl.setOverlay'),
            connectProxy: record('deviceControl.connectProxy'),
            disconnectProxy: record('deviceControl.disconnectProxy'),
            getProxyStatus: record('deviceControl.getProxyStatus'),
            listEsims: record('deviceControl.listEsims'),
            activateEsim: record('deviceControl.activateEsim'),
            enableEsim: record('deviceControl.enableEsim'),
            removeEsim: record('deviceControl.removeEsim'),
        },
        profiles: {
            listProfiles: record('profiles.listProfiles'),
            getProfile: record('profiles.getProfile'),
            createProfile: record('profiles.createProfile'),
            updateProfile: record('profiles.updateProfile'),
            deleteProfile: record('profiles.deleteProfile'),
            applyProfile: record('profiles.applyProfile'),
        },
        calls,
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

async function connectedClient(ctx: ToolCtx) {
    const server = buildMcpServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return { client, server };
}

describe('tasks tools', () => {
    test('all 6 tasks tools are registered under a full-access policy', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name);
        for (const name of ['run_task', 'get_task', 'list_tasks', 'stop_task', 'send_task_message', 'get_task_media']) {
            expect(names).toContain(name);
        }
    });

    test('run_task passes every param through to backend.tasks.runTask unchanged', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const args = {
            deviceId: 'd1',
            task: 'open settings',
            llmModel: 'gemini/gemini-2.5-flash',
            maxSteps: 20,
            outputSchema: { type: 'object' },
            stealth: true,
            vision: false,
            apps: ['com.android.settings'],
            credentials: [{ credentialNames: ['login'], packageName: 'com.example' }],
            files: ['file1'],
        };
        const result = await client.callTool({ name: 'run_task', arguments: args });
        expect(result.isError).not.toBe(true);

        const call = backend.calls.find((c) => c.method === 'tasks.runTask');
        expect(call).toBeDefined();
        expect(call?.args[0]).toEqual(args);
    });

    test('get_task view=summary/status/trajectory dispatch to the right backend method', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const cases: Array<{ view: string; expectMethod: string }> = [
            { view: 'summary', expectMethod: 'tasks.getTaskSummary' },
            { view: 'status', expectMethod: 'tasks.getTaskStatus' },
            { view: 'trajectory', expectMethod: 'tasks.getTaskTrajectory' },
        ];
        for (const { view, expectMethod } of cases) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'get_task', arguments: { view, taskId: 't1' } });
            expect(result.isError).not.toBe(true);
            expect(backend.calls.map((c) => c.method)).toEqual([expectMethod]);
        }
    });

    test('get_task view=trajectory forwards offset/limit into compactTrajectory (offset/limit not passed to backend, which has no paging param)', async () => {
        const backend = stubBackend();
        backend.tasks.getTaskTrajectory = () =>
            Promise.resolve({ events: Array.from({ length: 5 }, (_, i) => ({ event: `Event${i}` })) });
        const { client } = await connectedClient(ctxWith(backend));

        const result = await client.callTool({ name: 'get_task', arguments: { view: 'trajectory', taskId: 't1', offset: 1, limit: 2 } });
        expect(result.isError).not.toBe(true);
        const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '{}';
        const parsed = JSON.parse(text);
        expect(parsed.offset).toBe(1);
        expect(parsed.eventCount).toBe(2);
        expect(parsed.total).toBe(5);
        expect(parsed.hasMore).toBe(true);
        expect(parsed.nextOffset).toBe(3);
    });

    test('get_task_media kind=screenshot/ui_state dispatch to backend.tasks.getTaskMedia with the right kind + index', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const withIndex = await client.callTool({ name: 'get_task_media', arguments: { kind: 'screenshot', taskId: 't1', index: 2 } });
        expect(withIndex.isError).not.toBe(true);
        expect(backend.calls.at(-1)?.args).toEqual(['screenshot', 't1', 2]);

        backend.calls.length = 0;
        const noIndex = await client.callTool({ name: 'get_task_media', arguments: { kind: 'ui_state', taskId: 't1' } });
        expect(noIndex.isError).not.toBe(true);
        expect(backend.calls.at(-1)?.args).toEqual(['ui_state', 't1', undefined]);
    });

    test('list_tasks without deviceId dispatches to the global backend method', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));
        const result = await client.callTool({ name: 'list_tasks', arguments: { query: 'settings', status: 'running' } });
        expect(result.isError).not.toBe(true);
        expect(backend.calls.map((c) => c.method)).toEqual(['tasks.listTasks']);
    });

    test('list_tasks rejects query/status when deviceId is set (device-scoped listing has neither)', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const queryResult = await client.callTool({ name: 'list_tasks', arguments: { deviceId: 'd1', query: 'x' } });
        expect(queryResult.isError).toBe(true);
        expect(backend.calls).toHaveLength(0);

        const statusResult = await client.callTool({ name: 'list_tasks', arguments: { deviceId: 'd1', status: 'running' } });
        expect(statusResult.isError).toBe(true);
        expect(backend.calls).toHaveLength(0);
    });

    test('list_tasks rejects an orderBy value that belongs to the other branch', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const deviceScopedOnlyValueGlobally = await client.callTool({ name: 'list_tasks', arguments: { orderBy: 'assignedAt' } });
        expect(deviceScopedOnlyValueGlobally.isError).toBe(true);

        const globalOnlyValueDeviceScoped = await client.callTool({ name: 'list_tasks', arguments: { deviceId: 'd1', orderBy: 'status' } });
        expect(globalOnlyValueDeviceScoped.isError).toBe(true);

        expect(backend.calls).toHaveLength(0);
    });

    test('stop_task and send_task_message dispatch to the right backend methods', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        await client.callTool({ name: 'stop_task', arguments: { taskId: 't1' } });
        expect(backend.calls.at(-1)?.method).toBe('tasks.stopTask');

        await client.callTool({ name: 'send_task_message', arguments: { taskId: 't1', message: 'hello' } });
        const sendCall = backend.calls.at(-1);
        expect(sendCall?.method).toBe('tasks.sendTaskMessage');
        expect(sendCall?.args).toEqual(['t1', 'hello']);
    });

    test('operation-level gate applies to get_task (field "view") and get_task_media (field "kind")', async () => {
        const backend = stubBackend();
        const ctx = ctxWith(backend, {
            operationAllowlist: new Map([
                ['get_task', new Set(['status'])],
                ['get_task_media', new Set(['screenshot'])],
            ]),
        });
        const { client } = await connectedClient(ctx);

        const deniedView = await client.callTool({ name: 'get_task', arguments: { view: 'trajectory', taskId: 't1' } });
        expect(deniedView.isError).toBe(true);
        expect(backend.calls).toHaveLength(0);

        const allowedView = await client.callTool({ name: 'get_task', arguments: { view: 'status', taskId: 't1' } });
        expect(allowedView.isError).not.toBe(true);

        backend.calls.length = 0;
        const deniedKind = await client.callTool({ name: 'get_task_media', arguments: { kind: 'ui_state', taskId: 't1' } });
        expect(deniedKind.isError).toBe(true);
        expect(backend.calls).toHaveLength(0);
    });
});

describe('compactTrajectory', () => {
    test('caps events at MAX_TRAJECTORY_EVENTS (50) even if a larger limit is requested', () => {
        const events = Array.from({ length: 60 }, (_, i) => ({ event: `E${i}` }));
        const result = compactTrajectory({ events }, 0, 999);
        expect(result.eventCount).toBe(50);
        expect(result.hasMore).toBe(true);
        expect(result.nextOffset).toBe(50);
    });

    test('hasMore is false and nextOffset is absent when every event fits', () => {
        const events = Array.from({ length: 3 }, (_, i) => ({ event: `E${i}` }));
        const result = compactTrajectory({ events });
        expect(result.hasMore).toBe(false);
        expect(result.nextOffset).toBeUndefined();
        expect(result.total).toBe(3);
        expect(result.eventCount).toBe(3);
    });
});
