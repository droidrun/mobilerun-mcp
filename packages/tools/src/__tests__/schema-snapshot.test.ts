import { stubBackend as noopBackend } from './backend-stub.js';
// Snapshots the full-access tool surface (names + input schema shapes) so
// an accidental rename/removal, a required-field/type change, or a dropped
// enum value shows up as a diff in review — not silently in prod. See
// CONTRACT.md for what counts as a breaking (major) vs additive (minor) vs
// cosmetic (patch) change here, and update the snapshot deliberately when a
// change is intentional (`bun test --update-snapshots`).
import { describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer, fullAccessPolicy } from '../register.js';
import { createAuthContext } from '../ctx.js';



// Stably serialized: sorted tool list, each tool's own keys sorted so JSON
// key-order churn in the SDK's zod->JSON-Schema converter can't cause a
// false-positive diff independent of an actual shape change.
function stableSort(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableSort);
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
        return Object.fromEntries(entries.map(([k, v]) => [k, stableSort(v)]));
    }
    return value;
}

describe('tool contract snapshot', () => {
    test('full-access tool surface (names + input schemas) matches the committed snapshot', async () => {
        const ctx = { backend: noopBackend(), auth: createAuthContext({ kind: 'api_key', subject: 'snapshot' }), policy: fullAccessPolicy() };
        const server = buildMcpServer(ctx);
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'schema-snapshot', version: '0.0.0' });
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        const { tools } = await client.listTools();
        const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
        const surface = sorted.map((t) => ({
            name: t.name,
            hasDescription: Boolean(t.description && t.description.length > 0),
            inputSchema: stableSort(t.inputSchema),
        }));

        expect(surface).toMatchSnapshot();
    });
});
