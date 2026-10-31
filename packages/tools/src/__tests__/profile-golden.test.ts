import { expect, test } from 'bun:test';
import { connect } from './connect.js';
import { POLICY_PROFILES, policyForProfile } from '../policies.js';
import { BUNDLE_TOOLS } from '../tools/bundle-tools.js';

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
    const operations = new Map<string, Set<string>>();
    const activationGates: Record<string, unknown> = {};
    for (const profile of POLICY_PROFILES) {
        const policy = policyForProfile(profile);
        const pairs = [...policy.toolAllowlist].flatMap((name) => {
            const bundle = BUNDLE_TOOLS[name as keyof typeof BUNDLE_TOOLS];
            if (!bundle) return [name];
            const allowed = policy.operationAllowlist?.get(name);
            return bundle.operations.filter(({ op }) => !allowed || allowed.has(op)).map(({ op }) => `${name}.${op}`);
        });
        const allowed = policy.operationAllowlist?.get('manage_flow');
        const allowsActivation = policy.toolAllowlist.has('manage_flow') && (!allowed || (allowed.has('update') && allowed.has('activate')));
        operations.set(profile, new Set(pairs));
        const { backend, client, close } = await connect(policy);
        try {
            const activation = [];
            for (const fields of [{ enabled: true }, { lifecycleStatus: 'enabled' }, { enabled: false, lifecycleStatus: 'enabled' }]) {
                backend.calls.length = 0;
                const result = await client.callTool({ name: 'manage_flow', arguments: { operation: 'update', flowId: 'f1', ...fields } });
                activation.push({ fields, denied: result.isError === true, calls: [...backend.calls] });
            }
            activationGates[profile] = { effectiveOperations: allowsActivation ? ['manage_flow.update+enabled'] : [], activation };
        } finally {
            await close();
        }
    }
    const matrix = [...new Set([...operations.values()].flatMap((pairs) => [...pairs]))].sort()
        .map((operation) => `${operation}  ${POLICY_PROFILES.map((profile) => `${profile}:${operations.get(profile)?.has(operation) ? 'x' : '-'}`).join(' ')}`);
    expect(matrix.join('\n')).toMatchSnapshot('operations matrix');
    expect(activationGates).toMatchSnapshot('activation gates');
});

test('golden input schema shapes for every profile', async () => {
    const profiles = new Map<string, { name: string; inputSchema: unknown }[]>();
    let descriptions: unknown;
    for (const profile of POLICY_PROFILES) {
        const { client, close } = await connect(profile);
        try {
            const { tools } = await client.listTools();
            if (profile === 'full') descriptions = [...tools].sort((a, b) => a.name.localeCompare(b.name))
                .map(({ name, description }) => ({ name, description }));
            profiles.set(profile, tools.sort((a, b) => a.name.localeCompare(b.name))
                .map(({ name, inputSchema }) => ({ name, inputSchema: schemaShape(inputSchema, inputSchema) })));
        } finally {
            await close();
        }
    }
    const full = new Map(profiles.get('full')?.map(({ name, inputSchema }) => [name, inputSchema]));
    for (const profile of POLICY_PROFILES.filter((profile) => profile !== 'full')) {
        for (const { name, inputSchema } of profiles.get(profile) ?? []) {
            expect(full.has(name)).toBe(true);
            expect(inputSchema).toEqual(full.get(name));
        }
    }
    expect(profiles.get('full')).toMatchSnapshot('full profile schemas');
    expect(descriptions).toMatchSnapshot('full profile descriptions');
});

test('golden tool annotations', async () => {
    const { client, close } = await connect('full');
    try {
        const { tools } = await client.listTools();
        expect(tools.every((tool) => tool.annotations !== undefined)).toBe(true);
        expect(tools.sort((a, b) => a.name.localeCompare(b.name))
            .map(({ name, title, annotations }) => ({ name, title, annotations }))).toMatchSnapshot('full profile annotations');
    } finally {
        await close();
    }
});
