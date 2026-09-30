import { describe, expect, test } from 'bun:test';
import type Mobilerun from '@mobilerun/sdk';
import { createWorkflowsBackend } from '../sdk-backend/workflows.js';

describe('workflow response mapping', () => {
    test('normalizes unknown, missing, and null schedule rules across trigger reads', async () => {
        const validRule = { type: 'cron' as const, expression: '0 9 * * *', jitter: { beforeMinutes: 5 } };
        const triggers = [{ type: 'interval' }, undefined, null, validRule].map((scheduleRule, i) => ({
            id: `trigger-${i}`, scheduleRule,
        }));
        const pagination = { page: 1, pages: 1, total: 4, pageSize: 4, hasNext: false, hasPrev: false };
        const client = {
            workflows: {
                triggers: {
                    list: async () => ({ items: triggers, pagination }),
                    retrieve: async (id: string) => ({ data: triggers.find((trigger) => trigger.id === id) }),
                },
                events: {
                    dryRun: async () => ({ data: {
                        validation: { valid: true },
                        matchedFlows: triggers.map((trigger) => ({ trigger, wouldFire: true })),
                    } }),
                },
            },
        } as unknown as Mobilerun;
        const backend = createWorkflowsBackend(client);
        const list = await backend.listTriggers({});
        expect(list.items.map((trigger) => trigger.scheduleRule)).toEqual([null, null, null, validRule]);
        expect(list.pagination).toEqual(pagination);
        for (const trigger of list.items) {
            expect((await backend.getTrigger(trigger.id)).data).toEqual(trigger);
        }
        const dryRun = await backend.dryRunEvent({ eventType: 'app.example' });
        expect(dryRun.data.matchedFlows.map((match) => match.trigger)).toEqual(list.items);
        expect(dryRun.data.validation).toEqual({ valid: true });
    });

    test('retains app and source event fields in the synthetic catalog page', async () => {
        const client = {
            appEvents: { catalog: { list: async () => ({ data: [{
                appEventType: 'app.example.received', label: 'Received', appName: 'Example',
                sourceEventType: 'notification.received', packageName: null,
                category: 'app', payloadSchema: { type: 'object' },
            }] }) } },
        } as unknown as Mobilerun;
        expect(await createWorkflowsBackend(client).listAppEventCatalog()).toEqual({
            items: [{
                eventType: 'app.example.received', label: 'Received', appName: 'Example',
                sourceEventType: 'notification.received', packageName: null,
                source: 'app', payloadSchema: { type: 'object' },
                description: null, createdAt: null, updatedAt: null,
            }],
            pagination: { page: 1, pages: 1, pageSize: 1, total: 1, hasNext: false, hasPrev: false },
        });
    });
});
