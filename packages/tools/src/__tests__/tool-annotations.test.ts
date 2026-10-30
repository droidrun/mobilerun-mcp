import { expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Backend } from '../backend/index.js';
import { createAuthContext } from '../ctx.js';
import { buildMcpServer, fullAccessPolicy } from '../register.js';

test('every tool lists a title with readOnlyHint and destructiveHint', async () => {
    const ctx = {
        backend: {} as Backend,
        auth: createAuthContext({ kind: 'api_key', subject: 'tool-annotations' }),
        policy: fullAccessPolicy(),
    };
    const server = buildMcpServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'tool-annotations', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
        const tools = [];
        let cursor: string | undefined;
        do {
            const result = await client.listTools({ cursor });
            tools.push(...result.tools);
            cursor = result.nextCursor;
        } while (cursor);

        expect(tools).toHaveLength(39);
        for (const tool of tools) {
            expect(tool.title?.trim(), `${tool.name}: title`).toBeTruthy();
            expect(typeof tool.annotations?.readOnlyHint, `${tool.name}: readOnlyHint`).toBe('boolean');
            expect(typeof tool.annotations?.destructiveHint, `${tool.name}: destructiveHint`).toBe('boolean');
            // A read-only tool can never be destructive.
            if (tool.annotations?.readOnlyHint) expect(tool.annotations.destructiveHint, `${tool.name}`).toBe(false);
        }

        const hints = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));
        expect(hints.list_devices).toMatchObject({ readOnlyHint: true, destructiveHint: false });
        expect(hints.manage_device).toMatchObject({ readOnlyHint: false, destructiveHint: true });
        expect(hints.configure_device).toMatchObject({ readOnlyHint: false, destructiveHint: false });
        expect(hints.terminate_device).toMatchObject({ destructiveHint: true });
        expect(hints.create_device).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    } finally {
        await client.close();
        await server.close();
    }
});
