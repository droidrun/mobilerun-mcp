import { expect, test } from 'bun:test';
import { MAX_TOOL_INPUT_ELEMENTS } from '../register.js';
import { connect } from './connect.js';

test.each(['array', 'object'])('oversized nested %s input never reaches the tool handler', async (kind) => {
    const { client, calls } = await connect();
    const nested = kind === 'array'
        ? Array(MAX_TOOL_INPUT_ELEMENTS).fill(null)
        : Object.fromEntries(Array.from({ length: MAX_TOOL_INPUT_ELEMENTS }, (_, i) => [`k${i}`, null]));
    const result = await client.callTool({
        name: 'workflow_events', arguments: { operation: 'dry_run', eventType: 'test', payload: { nested } },
    });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain(`maximum of ${MAX_TOOL_INPUT_ELEMENTS} elements`);
    expect(calls).toEqual([]);
});

test('generous workflow action tree and maximum bounded webhook input reach handlers', async () => {
    const { client, calls } = await connect();
    const node = (position: number) => ({
        actionId: 'action', position, continueOnError: false, key: `step_${position}`,
        nameOverride: 'Step', recordingEnabled: true,
        overrides: { params: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`p${i}`, 'value'])) },
    });
    // 3 root keys + 100 * (1 array entry + 8 parent keys + 11 override keys
    // + 10 * (1 array entry + 7 child keys + 11 override keys)) = 21,003.
    const actions = Array.from({ length: 100 }, (_, i) => ({
        ...node(i), children: Array.from({ length: 10 }, (_, j) => node(j)),
    }));
    expect((await client.callTool({
        name: 'manage_flow', arguments: { operation: 'validate', name: 'Large flow', actions },
    })).isError).not.toBe(true);
    expect((await client.callTool({
        name: 'webhooks', arguments: { operation: 'create', url: 'https://example.com/hook', eventTypes: Array(100).fill('test'), description: 'Hook' },
    })).isError).not.toBe(true);
    expect(calls).toEqual(['workflows.manageFlowValidate', 'webhooks.createWebhook']);
});
