import { connect } from './connect.js';
import { stubBackend as createBackendStub } from './backend-stub.js';
import { describe, expect, test } from 'bun:test';
import { compactTrajectory } from '../tools/tasks.js';
const stubBackend = () => createBackendStub({ recordArgs: true, responses: {
    'tasks.runTask': { id: 't1', status: 'queued' },
    'tasks.getTaskSummary': { deviceId: 'd1', llmModel: 'x', task: 't', userId: 'u1' },
    'tasks.getTaskStatus': { status: 'running' },
    'tasks.getTaskTrajectory': { events: [{ event: 'QueuedEvent', data: { id: 't1' } }] },
    'tasks.listTasks': { items: [], pagination: { page: 1, pages: 1, pageSize: 20, total: 0, hasNext: false, hasPrev: false }, deviceScoped: false },
    'tasks.stopTask': { cancelled: true },
    'tasks.sendTaskMessage': { sent: true },
    'tasks.getTaskMedia': { urls: [] },
} });

describe('tasks tools', () => {
    test('run_task passes every param through to backend.tasks.runTask, mapping pacedInput to stealth', async () => {
        const backend = stubBackend();
        const { client } = await connect('full', { backend });

        const args = {
            deviceId: 'd1',
            task: 'open settings',
            llmModel: 'gemini/gemini-2.5-flash',
            maxSteps: 20,
            outputSchema: { type: 'object' },
            pacedInput: true,
            vision: false,
            apps: ['com.android.settings'],
            credentials: [{ credentialNames: ['login'], packageName: 'com.example' }],
            files: ['file1'],
        };
        const result = await client.callTool({ name: 'run_task', arguments: args });
        expect(result.isError).not.toBe(true);

        const call = backend.calls.find((c) => c.method === 'tasks.runTask');
        expect(call).toBeDefined();
        const { pacedInput, ...rest } = args;
        expect(call?.args[0]).toEqual({ ...rest, stealth: pacedInput });
    });

    test('get_task view=trajectory forwards offset/limit into compactTrajectory (offset/limit not passed to backend, which has no paging param)', async () => {
        const backend = stubBackend();
        backend.tasks.getTaskTrajectory = () =>
            Promise.resolve({ events: Array.from({ length: 5 }, (_, i) => ({ event: `Event${i}` })) });
        const { client } = await connect('full', { backend });

        const result = await client.callTool({ name: 'get_task', arguments: { view: 'trajectory', taskId: 't1', offset: 1, limit: 2 } });
        expect(result.isError).not.toBe(true);
        const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '{}';
        const parsed = JSON.parse(text);
        expect(parsed.offset).toBe(1);
        expect(parsed.eventCount).toBe(2);
        expect(parsed.total).toBe(5);
        expect(parsed.hasMore).toBe(true);
        expect(parsed.nextOffset).toBe(3);
    });

    test('list_tasks rejects query/status when deviceId is set (device-scoped listing has neither)', async () => {
        const backend = stubBackend();
        const { client } = await connect('full', { backend });

        const queryResult = await client.callTool({ name: 'list_tasks', arguments: { deviceId: 'd1', query: 'x' } });
        expect(queryResult.isError).toBe(true);
        expect(backend.calls).toHaveLength(0);

        const statusResult = await client.callTool({ name: 'list_tasks', arguments: { deviceId: 'd1', status: 'running' } });
        expect(statusResult.isError).toBe(true);
        expect(backend.calls).toHaveLength(0);
    });

    test('list_tasks rejects an orderBy value that belongs to the other branch', async () => {
        const backend = stubBackend();
        const { client } = await connect('full', { backend });

        const deviceScopedOnlyValueGlobally = await client.callTool({ name: 'list_tasks', arguments: { orderBy: 'assignedAt' } });
        expect(deviceScopedOnlyValueGlobally.isError).toBe(true);

        const globalOnlyValueDeviceScoped = await client.callTool({ name: 'list_tasks', arguments: { deviceId: 'd1', orderBy: 'status' } });
        expect(globalOnlyValueDeviceScoped.isError).toBe(true);

        expect(backend.calls).toHaveLength(0);
    });

});

describe('compactTrajectory', () => {
    test('caps events at MAX_TRAJECTORY_EVENTS (50) even if a larger limit is requested', () => {
        const events = Array.from({ length: 60 }, (_, i) => ({ event: `E${i}` }));
        const result = compactTrajectory({ events }, 0, 999);
        expect(result.eventCount).toBe(50);
        expect(result.hasMore).toBe(true);
        expect(result.nextOffset).toBe(50);
    });

    test('hasMore is false and nextOffset is absent when every event fits', () => {
        const events = Array.from({ length: 3 }, (_, i) => ({ event: `E${i}` }));
        const result = compactTrajectory({ events });
        expect(result.hasMore).toBe(false);
        expect(result.nextOffset).toBeUndefined();
        expect(result.total).toBe(3);
        expect(result.eventCount).toBe(3);
    });
});
