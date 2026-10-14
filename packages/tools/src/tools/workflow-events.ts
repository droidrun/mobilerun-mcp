import {
    operation,
    operationValues,
    operationInput,
    operationDescription,
    runOperation, registerBundle } from './operation-table.js';
import { requireValue } from './op-helpers.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const WORKFLOW_EVENTS_SHARED_FIELDS = {
    eventType: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
};

export const WORKFLOW_EVENTS_INTRO = "Ingest and simulate custom app/system events for trigger evaluation. Confirm eventType and payload shape before ingesting an event.";
export const WORKFLOW_EVENTS_TABLE = [
    operation({
        op: 'ingest',
        input: { eventType: WORKFLOW_EVENTS_SHARED_FIELDS.eventType, payload: WORKFLOW_EVENTS_SHARED_FIELDS.payload },
        access: 'commerce',
        doc: "Enqueue an event for trigger evaluation (eventType, optional payload); returns immediately with eventId.",
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.workflows;
            const eventType = requireValue(input.eventType, 'eventType', operation, 'workflow_events');
            return asTextResult(await backend.ingestEvent({ eventType, payload: input.payload }));
        },
    }),
    operation({
        op: 'dry_run',
        input: { eventType: WORKFLOW_EVENTS_SHARED_FIELDS.eventType, payload: WORKFLOW_EVENTS_SHARED_FIELDS.payload },
        access: 'read',
        doc: "Simulate an event against ALL configured flows without side effects (eventType, optional payload). Returns which flows would fire, their gates and payload validation errors.",
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.workflows;
            const eventType = requireValue(input.eventType, 'eventType', operation, 'workflow_events');
            // operation === 'dry_run'
            return asTextResult(await backend.dryRunEvent({ eventType, payload: input.payload }));
        },
    }),
] as const;


export function registerWorkflowEventsTool(server: McpServer, ctx: ToolCtx): void {
    
    registerBundle(server, ctx, 'workflow_events', WORKFLOW_EVENTS_TABLE, { intro: WORKFLOW_EVENTS_INTRO, shared: WORKFLOW_EVENTS_SHARED_FIELDS });
}
