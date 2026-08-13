// Tests for the device-control bundle tools: manage_device,
// device_action, manage_device_apps, manage_device_files, configure_device,
// manage_esim. Mirrors register.test.ts's stub-backend pattern,
// self-contained per this repo's convention (schema-snapshot.test.ts does
// the same rather than importing register.test.ts's helpers).
import { describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer, ALL_TOOL_NAMES } from '../register.js';
import type { Backend } from '../backend/index.js';
import { createAuthContext, type AuthContext, type ToolCtx } from '../ctx.js';

function stubBackend(): Backend & { calls: string[] } {
    const calls: string[] = [];
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
    return backend;
}

const testAuth: AuthContext = createAuthContext({ kind: 'api_key', subject: 'test-key' });

function ctxWith(backend: Backend): ToolCtx {
    return { backend, auth: testAuth, policy: { toolAllowlist: new Set(ALL_TOOL_NAMES) } };
}

async function connectedClient(ctx: ToolCtx) {
    const server = buildMcpServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    return { client, server };
}

function textOf(result: Awaited<ReturnType<Client['callTool']>>): string {
    return (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
}

const DEVICE_ID = 'd1';

describe('device-control bundle tools', () => {
    test('all 6 device-control tools are registered under a full-access policy', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));
        const { tools } = await client.listTools();
        const names = tools.map((t) => t.name);
        for (const name of ['manage_device', 'device_action', 'manage_device_apps', 'manage_device_files', 'configure_device', 'manage_esim']) {
            expect(names).toContain(name);
        }
        // device_recordings has no SDK support at all — must never be registered.
        expect(names).not.toContain('device_recordings');
    });

    test('manage_device dispatches each operation to the right backend method', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const cases: Array<{ args: Record<string, unknown>; expectMethod: string }> = [
            { args: { operation: 'reboot', deviceId: DEVICE_ID }, expectMethod: 'deviceControl.rebootDevice' },
            { args: { operation: 'reset', deviceId: DEVICE_ID }, expectMethod: 'deviceControl.resetDevice' },
            { args: { operation: 'rename', deviceId: DEVICE_ID, name: 'new-name' }, expectMethod: 'deviceControl.renameDevice' },
            { args: { operation: 'wait_ready', deviceId: DEVICE_ID }, expectMethod: 'deviceControl.waitDeviceReady' },
            { args: { operation: 'get_capabilities', deviceId: DEVICE_ID }, expectMethod: 'deviceControl.getDeviceCapabilities' },
            { args: { operation: 'count' }, expectMethod: 'deviceControl.countDevices' },
        ];
        for (const { args, expectMethod } of cases) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'manage_device', arguments: args });
            expect(result.isError).not.toBe(true);
            expect(backend.calls).toContain(expectMethod);
        }
    });

    test('manage_device: rename without deviceId is rejected before dispatch', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));
        const result = await client.callTool({ name: 'manage_device', arguments: { operation: 'rename', name: 'x' } });
        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain('deviceId');
        expect(backend.calls).not.toContain('deviceControl.renameDevice');
    });

    test('device_action dispatches each operation to the right backend method', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const cases: Array<{ args: Record<string, unknown>; expectMethod: string }> = [
            { args: { operation: 'tap', deviceId: DEVICE_ID, x: 10, y: 20 }, expectMethod: 'deviceControl.tap' },
            { args: { operation: 'swipe', deviceId: DEVICE_ID, startX: 0, startY: 0, endX: 100, endY: 100, duration: 300 }, expectMethod: 'deviceControl.swipe' },
            { args: { operation: 'keyboard_write', deviceId: DEVICE_ID, text: 'hi' }, expectMethod: 'deviceControl.keyboardWrite' },
            { args: { operation: 'keyboard_key', deviceId: DEVICE_ID, key: 66 }, expectMethod: 'deviceControl.keyboardKey' },
            { args: { operation: 'keyboard_clear', deviceId: DEVICE_ID }, expectMethod: 'deviceControl.keyboardClear' },
            { args: { operation: 'global_action', deviceId: DEVICE_ID, action: 4 }, expectMethod: 'deviceControl.globalAction' },
        ];
        for (const { args, expectMethod } of cases) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'device_action', arguments: args });
            expect(result.isError).not.toBe(true);
            expect(backend.calls).toContain(expectMethod);
        }
    });

    test('device_action: field allowlist rejects a field foreign to the chosen operation', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));
        // `text` belongs to keyboard_write, not tap.
        const result = await client.callTool({ name: 'device_action', arguments: { operation: 'tap', deviceId: DEVICE_ID, x: 1, y: 2, text: 'hi' } });
        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain('not valid for operation=tap');
        expect(backend.calls).not.toContain('deviceControl.tap');
    });

    test('manage_device_apps: read (list_packages) and mutation (install) are distinct operation values, both dispatch correctly', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const install = await client.callTool({ name: 'manage_device_apps', arguments: { operation: 'install', deviceId: DEVICE_ID, packageName: 'com.example.app' } });
        expect(install.isError).not.toBe(true);
        expect(backend.calls).toContain('deviceControl.installApp');

        backend.calls.length = 0;
        const list = await client.callTool({ name: 'manage_device_apps', arguments: { operation: 'list_packages', deviceId: DEVICE_ID } });
        expect(list.isError).not.toBe(true);
        expect(backend.calls).toContain('deviceControl.listPackages');
        expect(backend.calls).not.toContain('deviceControl.installApp');
    });

    test('manage_device_apps: install requires packageName or bundleId', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));
        const result = await client.callTool({ name: 'manage_device_apps', arguments: { operation: 'install', deviceId: DEVICE_ID } });
        expect(result.isError).toBe(true);
        expect(backend.calls).not.toContain('deviceControl.installApp');
    });

    test('manage_device_files dispatches each operation to the right backend method', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const cases: Array<{ args: Record<string, unknown>; expectMethod: string }> = [
            { args: { operation: 'list', deviceId: DEVICE_ID, path: '/sdcard' }, expectMethod: 'deviceControl.listFiles' },
            { args: { operation: 'upload', deviceId: DEVICE_ID, path: '/sdcard/f.txt', contentBase64: Buffer.from('hi').toString('base64') }, expectMethod: 'deviceControl.uploadFile' },
            { args: { operation: 'download', deviceId: DEVICE_ID, path: '/sdcard/f.txt' }, expectMethod: 'deviceControl.downloadFile' },
            { args: { operation: 'delete', deviceId: DEVICE_ID, path: '/sdcard/f.txt' }, expectMethod: 'deviceControl.deleteFile' },
        ];
        for (const { args, expectMethod } of cases) {
            backend.calls.length = 0;
            const result = await client.callTool({ name: 'manage_device_files', arguments: args });
            expect(result.isError).not.toBe(true);
            expect(backend.calls).toContain(expectMethod);
        }
    });

    test('manage_device_files: upload payload over the inline size cap is rejected before dispatch', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));
        const oversized = 'A'.repeat(400_000); // > MAX_INLINE_BASE64_CHARS, also fails the schema's z.string().max()
        const result = await client.callTool({ name: 'manage_device_files', arguments: { operation: 'upload', deviceId: DEVICE_ID, path: '/f', contentBase64: oversized } });
        expect(result.isError).toBe(true);
        expect(backend.calls).not.toContain('deviceControl.uploadFile');
    });

    test('configure_device: get_language (read) and set_language (mutation) are distinct operation values, both dispatch correctly', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const get = await client.callTool({ name: 'configure_device', arguments: { operation: 'get_language', deviceId: DEVICE_ID } });
        expect(get.isError).not.toBe(true);
        expect(backend.calls).toContain('deviceControl.getLanguage');

        backend.calls.length = 0;
        const set = await client.callTool({ name: 'configure_device', arguments: { operation: 'set_language', deviceId: DEVICE_ID, locale: 'en-US' } });
        expect(set.isError).not.toBe(true);
        expect(backend.calls).toContain('deviceControl.setLanguage');
        expect(backend.calls).not.toContain('deviceControl.getLanguage');
    });

    test('configure_device: field allowlist rejects a field foreign to the chosen operation', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));
        const result = await client.callTool({ name: 'configure_device', arguments: { operation: 'get_timezone', deviceId: DEVICE_ID, locale: 'en-US' } });
        expect(result.isError).toBe(true);
        expect(textOf(result)).toContain('not valid for operation=get_timezone');
        expect(backend.calls).not.toContain('deviceControl.getTimezone');
    });

    test('configure_device proxy operations dispatch correctly', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const connect = await client.callTool({
            name: 'configure_device',
            arguments: { operation: 'proxy_connect', deviceId: DEVICE_ID, socks5Host: 'proxy.example.com', socks5Port: 1080 },
        });
        expect(connect.isError).not.toBe(true);
        expect(backend.calls).toContain('deviceControl.connectProxy');

        backend.calls.length = 0;
        const status = await client.callTool({ name: 'configure_device', arguments: { operation: 'get_proxy_status', deviceId: DEVICE_ID } });
        expect(status.isError).not.toBe(true);
        expect(backend.calls).toContain('deviceControl.getProxyStatus');
    });

    test('manage_esim: list (read) and remove (destructive mutation) are distinct operation values, both dispatch correctly', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));

        const list = await client.callTool({ name: 'manage_esim', arguments: { operation: 'list', deviceId: DEVICE_ID } });
        expect(list.isError).not.toBe(true);
        expect(backend.calls).toContain('deviceControl.listEsims');

        backend.calls.length = 0;
        const remove = await client.callTool({ name: 'manage_esim', arguments: { operation: 'remove', deviceId: DEVICE_ID, subId: 1 } });
        expect(remove.isError).not.toBe(true);
        expect(backend.calls).toContain('deviceControl.removeEsim');
        expect(backend.calls).not.toContain('deviceControl.listEsims');
    });

    test('manage_esim: activate requires smDpAddr and enable', async () => {
        const backend = stubBackend();
        const { client } = await connectedClient(ctxWith(backend));
        const result = await client.callTool({ name: 'manage_esim', arguments: { operation: 'activate', deviceId: DEVICE_ID } });
        expect(result.isError).toBe(true);
        expect(backend.calls).not.toContain('deviceControl.activateEsim');
    });

    test('operation-level allowlist gates a device-control bundle tool the same way as webhooks', async () => {
        const backend = stubBackend();
        const ctx: ToolCtx = {
            backend,
            auth: testAuth,
            policy: {
                toolAllowlist: new Set(ALL_TOOL_NAMES),
                operationAllowlist: new Map([['manage_device', new Set(['get_capabilities', 'count'])]]),
            },
        };
        const { client } = await connectedClient(ctx);

        const denied = await client.callTool({ name: 'manage_device', arguments: { operation: 'reboot', deviceId: DEVICE_ID } });
        expect(denied.isError).toBe(true);
        expect(textOf(denied)).toContain('Operation "reboot" of tool "manage_device" is not available');
        expect(backend.calls).not.toContain('deviceControl.rebootDevice');

        const allowed = await client.callTool({ name: 'manage_device', arguments: { operation: 'count' } });
        expect(allowed.isError).not.toBe(true);
        expect(backend.calls).toContain('deviceControl.countDevices');
    });
});
