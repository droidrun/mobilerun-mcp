import { stubBackend } from './backend-stub.js';
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

    test('device_action maps pacedInput to the API stealth parameter', async () => {
        const backend = stubBackend();
        const captured: unknown[] = [];
        backend.deviceControl.tap = async (params: unknown) => void captured.push(params);
        const { client } = await connectedClient(ctxWith(backend));
        const result = await client.callTool({ name: 'device_action', arguments: { operation: 'tap', deviceId: DEVICE_ID, x: 1, y: 2, pacedInput: true } });
        expect(result.isError).not.toBe(true);
        expect(captured[0]).toMatchObject({ deviceId: DEVICE_ID, x: 1, y: 2, stealth: true });
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


test('device validation follows table order and deduplicates allowed fields', async () => {
    const backend = stubBackend();
    const { client } = await connectedClient(ctxWith(backend));
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
