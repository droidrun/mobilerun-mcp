import { expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createAuthContext } from '../ctx.js';
import { POLICY_PROFILES, policyForProfile } from '../policies.js';
import { buildMcpServer } from '../register.js';
import { BUNDLE_TOOLS } from '../tools/bundle-tools.js';
import { stubBackend } from './backend-stub.js';

// Expand local refs so field traversal order cannot hide or invent a shape change.
// Preserve every schema constraint except descriptions; required sets are unordered.
function schemaShape(value: unknown, root: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => schemaShape(item, root));
    if (!value || typeof value !== 'object') return value;
    const node = value as Record<string, unknown>;
    if (typeof node.$ref === 'string') {
        const target = node.$ref.slice(2).split('/').reduce<unknown>((current, key) =>
            (current as Record<string, unknown>)[key.replace(/~1/g, '/').replace(/~0/g, '~')], root);
        return schemaShape({ ...(target as object), ...Object.fromEntries(Object.entries(node).filter(([key]) => key !== '$ref')) }, root);
    }
    return Object.fromEntries(Object.entries(node)
        .filter(([key]) => key !== 'description')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, key === 'required' && Array.isArray(item) ? [...item].sort() : schemaShape(item, root)]));
}

test('golden allowed operations and activation gates for every profile', async () => {
    const profiles: Record<string, unknown> = {};
    for (const profile of POLICY_PROFILES) {
        const policy = policyForProfile(profile);
        const pairs = [...policy.toolAllowlist].flatMap((name) => {
            const bundle = BUNDLE_TOOLS[name as keyof typeof BUNDLE_TOOLS];
            if (!bundle) return [name];
            const allowed = policy.operationAllowlist?.get(name);
            return bundle.operations.filter(({ op }) => !allowed || allowed.has(op)).map(({ op }) => `${name}.${op}`);
        });
        const allowed = policy.operationAllowlist?.get('manage_flow');
        if (policy.toolAllowlist.has('manage_flow') && (!allowed || (allowed.has('update') && allowed.has('activate')))) {
            pairs.push('manage_flow.update+enabled');
        }
        const backend = stubBackend();
        const server = buildMcpServer({ backend, auth: createAuthContext({ kind: 'api_key', subject: 'golden' }), policy });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'profile-golden', version: '0.0.0' });
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
        try {
            const activation = [];
            for (const fields of [{ enabled: true }, { lifecycleStatus: 'enabled' }, { enabled: false, lifecycleStatus: 'enabled' }]) {
                backend.calls.length = 0;
                const result = await client.callTool({ name: 'manage_flow', arguments: { operation: 'update', flowId: 'f1', ...fields } });
                activation.push({ fields, denied: result.isError === true, calls: [...backend.calls] });
            }
            profiles[profile] = { operations: pairs.sort(), activation };
        } finally {
            await client.close();
            await server.close();
        }
    }
    expect(profiles).toMatchSnapshot();
});

test('golden input schema shapes for every profile', async () => {
    const profiles: Record<string, unknown> = {};
    for (const profile of POLICY_PROFILES) {
        const server = buildMcpServer({ backend: stubBackend(), auth: createAuthContext({ kind: 'api_key', subject: 'golden' }), policy: policyForProfile(profile) });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'profile-golden', version: '0.0.0' });
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
        try {
            const { tools } = await client.listTools();
            profiles[profile] = tools.sort((a, b) => a.name.localeCompare(b.name))
                .map(({ name, inputSchema }) => ({ name, inputSchema: schemaShape(inputSchema, inputSchema) }));
        } finally {
            await client.close();
            await server.close();
        }
    }
    expect(profiles).toMatchSnapshot();
});
