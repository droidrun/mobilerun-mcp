// The three server-start policy profiles. `no-commerce` is the REQUIRED safe default
// (a public server that forgets to set a profile must never fail open to
// `full`); `readonly` must hide every mutation, including at the
// `webhooks` bundle's operation level.
import { describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Backend } from '../backend/index.js';
import { createAuthContext } from '../ctx.js';
import { ALL_TOOL_NAMES, buildMcpServer } from '../register.js';
import { policyForProfile } from '../policies.js';

function stubBackend(): Backend & { calls: string[] } {
    const calls: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record = (name: string, result: unknown = { ok: true }): Promise<any> => {
        calls.push(name);
        return Promise.resolve(result);
    };
    return {
        calls,
        devices: {
            listDevices: () => record('devices.listDevices'),
            getDevice: () => record('devices.getDevice'),
            getDeviceScreenshot: () => record('devices.getDeviceScreenshot'),
            getDeviceUiState: () => record('devices.getDeviceUiState', { a11y_tree: { children: [] }, phone_state: {} }),
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
    };
}

const testAuth = createAuthContext({ kind: 'api_key', subject: 'test-key' });

async function connectedClient(backend: Backend, profile: Parameters<typeof policyForProfile>[0]) {
    const server = buildMcpServer({ backend, auth: testAuth, policy: policyForProfile(profile) });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return client;
}

describe('policyForProfile', () => {
    test('"full" registers all 34 tools', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'full');
        const { tools } = await client.listTools();
        expect(tools).toHaveLength(34);
        expect(tools.map((t) => t.name).sort()).toEqual([...ALL_TOOL_NAMES].sort());
    });

    test('"no-commerce" (the required safe default) hides create_device and terminate_device only', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'no-commerce');
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name).sort();
        expect(names).not.toContain('create_device');
        expect(names).not.toContain('terminate_device');
        expect(tools).toHaveLength(32);
        expect(names).toEqual([...ALL_TOOL_NAMES].filter((n) => n !== 'create_device' && n !== 'terminate_device').sort());

        // Everything else, including other mutations, stays reachable.
        const created = await client.callTool({ name: 'create_action', arguments: { catalogEntryId: 'c1', name: 'a' } });
        expect(created.isError).not.toBe(true);
        expect(backend.calls).toContain('workflows.createAction');
    });

    test('"readonly" hides create_* tools, device lifecycle tools, device_action, and manage_credentials', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'readonly');
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name).sort();

        for (const denied of [
            'create_device',
            'terminate_device',
            'create_action',
            'create_trigger',
            'create_flow',
            'device_action',
            'manage_credentials',
            'run_task',
            'stop_task',
            'send_task_message',
        ]) {
            expect(names).not.toContain(denied);
        }

        expect(names).toEqual(
            [
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
                arguments: { operation: mutating, url: 'https://example.com/hook', endpointId: '550e8400-e29b-41d4-a716-446655440000' },
            });
            expect(result.isError).toBe(true);
            const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
            expect(text).toContain(`Operation "${mutating}" of tool "webhooks" is not available`);
            expect(backend.calls).toEqual([]);
        }
    });

    test('"readonly" leaves list_workflow_resources / get_workflow_resource fully available (all resource values)', async () => {
        const backend = stubBackend();
        const client = await connectedClient(backend, 'readonly');

        const flow = await client.callTool({ name: 'list_workflow_resources', arguments: { resource: 'flow' } });
        expect(flow.isError).not.toBe(true);
        expect(backend.calls).toContain('workflows.listFlows');

        const execution = await client.callTool({ name: 'get_workflow_resource', arguments: { resource: 'execution', id: 'e1' } });
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
            const result = await client.callTool({ name: 'manage_device', arguments: { operation: mutating, deviceId: 'd1' } });
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
            const result = await client.callTool({ name: 'connect', arguments: { operation: mutating, country: 'us', proxyId: 'p1', userId: 'u1' } });
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
            const result = await client.callTool({ name: 'connect', arguments: { operation: denied, country: 'us', proxyId: 'p1' } });
            expect(result.isError).toBe(true);
            const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
            expect(text).toContain(`Operation "${denied}" of tool "connect" is not available`);
            expect(backend.calls).toEqual([]);
        }
    });
});
