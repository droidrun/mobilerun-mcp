import { expect, test } from 'bun:test';
import { BUNDLE_TOOLS } from '../tools/bundle-tools.js';
import { connect } from './connect.js';
import { DISPATCH_CASES } from './dispatch-cases.js';

test('every bundle operation calls its backend method with flat params', async () => {
    const expected = Object.values(BUNDLE_TOOLS).flatMap(({ name, field, operations }) => operations.map(({ op }) => `${name}.${field}.${op}`));
    const actual = DISPATCH_CASES.flatMap(({ name, arguments: input }) => {
        const bundle = BUNDLE_TOOLS[name as keyof typeof BUNDLE_TOOLS];
        return bundle ? [`${name}.${bundle.field}.${input[bundle.field]}`] : [];
    });
    expect([...new Set(actual)].sort()).toEqual(expected.sort());
    const s = await connect('full', { recordArgs: true, responses: {
        'deviceControl.manageDeviceScreenshotsCapture': { mimeType: 'image/png', contentBase64: 'aGk=' },
    } });
    for (const { name, arguments: input, calls } of DISPATCH_CASES) {
        s.calls.length = 0;
        const result = await s.client.callTool({ name, arguments: input });
        expect(result.isError, `${name}.${Object.values(input)[0]}`).not.toBe(true);
        expect(s.calls, `${name}.${Object.values(input)[0]}`).toEqual(calls);
    }
});

test('missing required args never reach the backend', async () => {
    const s = await connect('full', { recordArgs: true });
    const cases: Array<{ name: string; arguments: Record<string, unknown> }> = [
        { name: 'manage_device', arguments: { operation: 'rename', name: 'x' } },
        { name: 'manage_device_apps', arguments: { operation: 'install', deviceId: 'd1' } },
        { name: 'manage_esim', arguments: { operation: 'activate', deviceId: 'd1' } },
        ...['clone', 'unblock', 'add_action', 'remove_action', 'replace_actions'].map((operation) => ({ name: 'manage_flow', arguments: { operation } })),
        ...['ingest', 'dry_run'].map((operation) => ({ name: 'workflow_events', arguments: { operation } })),
        { name: 'apps', arguments: { operation: 'create_upload_url' } },
        { name: 'manage_credentials', arguments: { operation: 'add_field', packageName: 'com.example', credentialName: 'main', value: 'x' } },
        { name: 'list_workflow_resources', arguments: { resource: 'service_methods' } },
        ...[
            ['numbers', 'capacity'], ['numbers', 'get'], ['numbers', 'send'],
            ['mailboxes', 'update'], ['mailboxes', 'message'], ['messages', 'mark_read'], ['files', 'upload_url'],
        ].map(([name, operation]) => ({ name: name!, arguments: { operation } })),
    ];
    for (const input of cases) {
        const result = await s.client.callTool(input);
        expect(result.isError, `${input.name}.${Object.values(input.arguments)[0]}`).toBe(true);
        expect(s.calls).toEqual([]);
    }
});
