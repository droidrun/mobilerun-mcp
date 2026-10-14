import { expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Backend } from '../backend/index.js';
import { createAuthContext } from '../ctx.js';
import { ALL_TOOL_NAMES, buildMcpServer, fullAccessPolicy } from '../register.js';

const BANNED_WORDING = /\bR2\b|orchestrator|harness|internal|droidrun-connect|(?<!no-)\bCOMMERCE\b|fingerprint|appears where|mistake|\bSDK\b|[a-z]+-api\b|spoof|undetect|evad|human-?like|humantouch/i;

function* schemaDescriptions(value: unknown): Generator<string> {
    if (Array.isArray(value)) {
        for (const item of value) yield* schemaDescriptions(item);
    } else if (value && typeof value === 'object') {
        for (const [key, nested] of Object.entries(value)) {
            if (key === 'description' && typeof nested === 'string') yield nested;
            else yield* schemaDescriptions(nested);
        }
    }
}

test('every registered tool and input description uses public product wording', async () => {
    // Listing metadata never invokes backend methods. Any unexpected call fails.
    const ctx = {
        backend: {} as Backend,
        auth: createAuthContext({ kind: 'api_key', subject: 'public-wording' }),
        policy: fullAccessPolicy(),
    };
    const server = buildMcpServer(ctx);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'public-wording', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    try {
        const seen: string[] = [];
        let cursor: string | undefined;
        do {
            const result = await client.listTools({ cursor });
            for (const tool of result.tools) {
                seen.push(tool.name);
                for (const description of [tool.description ?? '', ...schemaDescriptions(tool.inputSchema)]) {
                    const match = description.match(BANNED_WORDING);
                    expect(match, `${tool.name}: banned wording "${match?.[0]}" in description "${description}"`).toBeNull();
                }
            }
            cursor = result.nextCursor;
        } while (cursor);
        expect(seen.sort()).toEqual([...ALL_TOOL_NAMES].sort());
    } finally {
        await client.close();
        await server.close();
    }
});
