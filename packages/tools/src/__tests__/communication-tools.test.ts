import { describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { type Backend } from '../backend/index.js';
import { createAuthContext } from '../ctx.js';
import { policyForProfile, type PolicyProfile } from '../policies.js';
import { buildMcpServer } from '../register.js';

type Case = { operation: string; method: string; args?: Record<string, unknown>; read?: boolean; commerce?: boolean };
const cases: Record<string, Case[]> = {
    numbers: [
        { operation: 'countries', method: 'numbersCountries', read: true },
        { operation: 'capacity', method: 'numbersCapacity', args: { country: 'de' }, read: true },
        { operation: 'list', method: 'numbersList', args: { page: 2 }, read: true },
        { operation: 'get', method: 'numbersGet', args: { numberId: 'n1' }, read: true },
        {
            operation: 'create',
            method: 'numbersCreate',
            args: { country: 'de', label: 'Signup', clientRequestId: 'purchase-1' },
            commerce: true,
        },
        { operation: 'update', method: 'numbersUpdate', args: { numberId: 'n1', label: null } },
        { operation: 'delete', method: 'numbersDelete', args: { numberId: 'n1' }, commerce: true },
        {
            operation: 'messages',
            method: 'numbersMessages',
            args: { numberId: 'n1', direction: 'inbound', since: '2026-10-14T00:00:00Z' },
            read: true,
        },
        {
            operation: 'send',
            method: 'numbersSend',
            args: { numberId: 'n1', body: 'Hello', to: '+49123456789' },
            commerce: true,
        },
    ],
    mailboxes: [
        { operation: 'list', method: 'mailboxesList', args: { page: 2 }, read: true },
        { operation: 'capacity', method: 'mailboxesCapacity', read: true },
        {
            operation: 'create',
            method: 'mailboxesCreate',
            args: { label: 'Signup', clientRequestId: 'mailbox-1' },
            commerce: true,
        },
        { operation: 'get', method: 'mailboxesGet', args: { mailboxId: 'mb1' }, read: true },
        { operation: 'update', method: 'mailboxesUpdate', args: { mailboxId: 'mb1', label: null } },
        { operation: 'delete', method: 'mailboxesDelete', args: { mailboxId: 'mb1' }, commerce: true },
        { operation: 'uncancel', method: 'mailboxesUncancel', args: { mailboxId: 'mb1' }, commerce: true },
        {
            operation: 'restart',
            method: 'mailboxesRestart',
            args: { mailboxId: 'mb1', billingPreference: 'rent' },
            commerce: true,
        },
        { operation: 'disconnect', method: 'mailboxesDisconnect', args: { mailboxId: 'mb1' } },
        {
            operation: 'otp',
            method: 'mailboxesOtp',
            args: { mailboxId: 'mb1', after: '2026-10-14T00:00:00Z', minLength: 6 },
            read: true,
        },
        {
            operation: 'messages',
            method: 'mailboxesMessages',
            args: { mailboxId: 'mb1', cursor: 'next', hasOtp: true },
            read: true,
        },
        {
            operation: 'message',
            method: 'mailboxesMessage',
            args: { mailboxId: 'mb1', messageId: 'opaque-message' },
            read: true,
        },
        {
            operation: 'connect',
            method: 'mailboxesConnect',
            args: { label: 'Personal', clientRequestId: 'connection-1' },
        },
        { operation: 'connection', method: 'mailboxesConnection', args: { connectionId: 'mb1' }, read: true },
    ],
    messages: [
        { operation: 'list', method: 'messagesList', args: { numberId: 'n1' }, read: true },
        { operation: 'get', method: 'messagesGet', args: { messageId: 'sms1' }, read: true },
        {
            operation: 'conversations',
            method: 'messagesConversations',
            args: { cursorLastMessageId: 'sms1', cursorLastOccurredAt: '2026-10-14T00:00:00Z' },
            read: true,
        },
        {
            operation: 'mark_read',
            method: 'messagesMarkRead',
            args: { peerKey: 'peer1', upToMessageId: 'sms1', upToOccurredAt: '2026-10-14T00:00:00Z' },
        },
    ],
    files: [
        { operation: 'list', method: 'filesList', args: { zone: 'user' }, read: true },
        { operation: 'download', method: 'filesDownload', args: { fileId: 'f1' }, read: true },
        { operation: 'update', method: 'filesUpdate', args: { fileId: 'f1', displayName: 'Instructions' } },
        { operation: 'delete', method: 'filesDelete', args: { fileId: 'f1' } },
        { operation: 'cancel_pending', method: 'filesCancelPending', args: { fileId: 'f1' } },
        { operation: 'confirm', method: 'filesConfirm', args: { fileId: 'f1' } },
        {
            operation: 'upload_url',
            method: 'filesUploadUrl',
            args: { filename: 'notes.txt', mimeType: 'text/plain', sizeBytes: 42 },
        },
    ],
};

async function session(profile: PolicyProfile) {
    const calls: Array<{ domain: string; method: string; params: unknown }> = [];
    const backend = Object.fromEntries(
        Object.keys(cases).map((domain) => [
            domain,
            new Proxy(
                {},
                {
                    get: (_target, method) => async (params: unknown) => {
                        calls.push({ domain, method: String(method), params });
                        return { accepted: true };
                    },
                },
            ),
        ]),
    ) as Backend;
    const server = buildMcpServer({
        backend,
        auth: createAuthContext({ kind: 'api_key', subject: 'test' }),
        policy: policyForProfile(profile),
    });
    const client = new Client({ name: 'communication-test', version: '0.0.0' });
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

for (const [toolName, operations] of Object.entries(cases)) {
    describe(toolName, () => {
        test('registers every operation and routes validated arguments', async () => {
            const s = await session('full');
            try {
                const tool = (await s.client.listTools()).tools.find((t) => t.name === toolName)!;
                const schema = tool.inputSchema.properties?.operation as { enum: string[] };
                expect(schema.enum.slice().sort()).toEqual(operations.map((o) => o.operation).sort());
                for (const op of operations) {
                    s.calls.length = 0;
                    const result = await s.client.callTool({
                        name: toolName,
                        arguments: { operation: op.operation, ...op.args },
                    });
                    expect(result.isError, op.operation).not.toBe(true);
                    expect(s.calls).toEqual([{ domain: toolName, method: op.method, params: op.args }]);
                    expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text)).toEqual({
                        accepted: true,
                    });
                }
            } finally {
                await s.close();
            }
        });
        test('readonly advertises the read subset and blocks every mutation before dispatch', async () => {
            const s = await session('readonly');
            try {
                const tool = (await s.client.listTools()).tools.find((t) => t.name === toolName)!;
                const advertised = tool
                    .description!.split('Available for this credential: ')[1]!
                    .replace(/\.$/, '')
                    .split(', ')
                    .sort();
                expect(advertised).toEqual(
                    operations
                        .filter((o) => o.read)
                        .map((o) => o.operation)
                        .sort(),
                );
                for (const op of operations) {
                    s.calls.length = 0;
                    const result = await s.client.callTool({
                        name: toolName,
                        arguments: { operation: op.operation, ...op.args },
                    });
                    expect(result.isError === true, op.operation).toBe(!op.read);
                    expect(s.calls.length, op.operation).toBe(op.read ? 1 : 0);
                }
            } finally {
                await s.close();
            }
        });
        test('no-commerce blocks billed operations before dispatch and permits the rest', async () => {
            const s = await session('no-commerce');
            try {
                for (const op of operations) {
                    s.calls.length = 0;
                    const result = await s.client.callTool({
                        name: toolName,
                        arguments: { operation: op.operation, ...op.args },
                    });
                    expect(result.isError === true, op.operation).toBe(!!op.commerce);
                    expect(s.calls.length, op.operation).toBe(op.commerce ? 0 : 1);
                }
            } finally {
                await s.close();
            }
        });
    });
}

test('missing purchase/read/send arguments never reach a backend', async () => {
    const s = await session('full');
    try {
        for (const [name, operation] of [
            ['numbers', 'capacity'],
            ['numbers', 'get'],
            ['numbers', 'send'],
            ['mailboxes', 'update'],
            ['mailboxes', 'message'],
            ['messages', 'mark_read'],
            ['files', 'upload_url'],
        ]) {
            const result = await s.client.callTool({ name: name!, arguments: { operation } });
            expect(result.isError).toBe(true);
        }
        expect(s.calls).toEqual([]);
    } finally {
        await s.close();
    }
});

test('no-commerce denies billed device, eSIM and execution operations before backend calls', async () => {
    const s = await session('no-commerce');
    try {
        for (const [name, operation] of [
            ['manage_device', 'stop'],
            ['manage_device', 'resume'],
            ['manage_esim', 'activate'],
            ['manage_flow', 'run'],
            ['manage_flow', 'verify'],
            ['manage_flow', 'fire_trigger'],
        ]) {
            const result = await s.client.callTool({ name: name!, arguments: { operation, deviceId: 'd1' } });
            expect(result.isError).toBe(true);
            expect((result.content as Array<{ text: string }>)[0]!.text).toContain('not available for this credential');
        }
        expect(s.calls).toEqual([]);
    } finally {
        await s.close();
    }
});
