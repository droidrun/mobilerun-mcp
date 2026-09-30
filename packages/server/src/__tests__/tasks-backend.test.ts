import { describe, expect, test } from 'bun:test';
import type Mobilerun from '@mobilerun/sdk';
import { BackendError, type PageMeta } from '@mobilerun/mcp-tools';
import { createTasksBackend } from '../sdk-backend/tasks.js';

describe('task list status filters', () => {
    test.each([undefined, 'device-1'])('rejects paused before calling upstream (deviceId=%s)', async (deviceId) => {
        let calls = 0;
        const list = async () => { calls++; return {}; };
        const client = { tasks: { list }, devices: { tasks: { list } } } as unknown as Mobilerun;
        try {
            await createTasksBackend(client).listTasks({ status: 'paused', deviceId });
            throw new Error('expected invalid input');
        } catch (error) {
            expect(error).toBeInstanceOf(BackendError);
            expect((error as BackendError).code).toBe('invalid_input');
            expect((error as BackendError).message).toBe('paused is no longer a filterable task status');
        }
        expect(calls).toBe(0);
    });

    test('forwards a supported status to the task list', async () => {
        const calls: unknown[] = [];
        const client = { tasks: { list: async (params: unknown) => {
            calls.push(params);
            return { items: [], pagination: { page: 1, pages: 1, pageSize: 20, total: 0, hasNext: false, hasPrev: false } satisfies PageMeta };
        } } } as unknown as Mobilerun;
        expect(await createTasksBackend(client).listTasks({ status: 'completed' })).toEqual({
            items: [], pagination: { page: 1, pages: 1, pageSize: 20, total: 0, hasNext: false, hasPrev: false }, deviceScoped: false,
        });
        expect(calls).toEqual([{
            status: 'completed', orderBy: undefined, orderByDirection: undefined,
            page: undefined, pageSize: undefined, query: undefined,
        }]);
    });
});
