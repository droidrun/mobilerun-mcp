import {
    type Operation,
    operationValues,
    selectInput,
    operationInput,
    operationDescription,
    runOperation,
} from './operation-table.js';
import { requireValue } from './op-helpers.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const WORKFLOW_EVENTS_INPUT_FIELDS = {
    eventType: z.string().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
};
type WorkflowEventsInput = z.infer<z.ZodObject<typeof WORKFLOW_EVENTS_INPUT_FIELDS>> & {
    operation: string;
};
export const WORKFLOW_EVENTS_TABLE = [
    {
        op: 'ingest',
        input: selectInput(WORKFLOW_EVENTS_INPUT_FIELDS, ['eventType', 'payload']),
        access: 'commerce',
        describe: {
            order: 0,
            text: 'Ingest and simulate custom app/system events for trigger evaluation. Operations: ingest (eventType, optional payload — enqueues for trigger evaluation, returns immediately with an eventId), ',
        },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.workflows;
            const eventType = requireValue(input.eventType, 'eventType', operation, 'workflow_events');
            return backend.ingestEvent({ eventType, payload: input.payload });
        },
    },
    {
        op: 'dry_run',
        input: selectInput(WORKFLOW_EVENTS_INPUT_FIELDS, ['eventType', 'payload']),
        access: 'read',
        describe: {
            order: 1,
            text: 'dry_run (eventType, optional payload — simulates against ALL configured flows, no side effects: returns which flows would fire, their gates, and payload validation errors). Confirm eventType and payload shape before ingesting an event.',
        },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.workflows;
            const eventType = requireValue(input.eventType, 'eventType', operation, 'workflow_events');
            // operation === 'dry_run'
            return backend.dryRunEvent({ eventType, payload: input.payload });
        },
    },
] as const satisfies readonly Operation<WorkflowEventsInput>[];
const WORKFLOW_EVENTS_OPERATIONS = operationValues(WORKFLOW_EVENTS_TABLE);

export function registerWorkflowEventsTool(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(
        WORKFLOW_EVENTS_OPERATIONS,
        ctx.policy.operationAllowlist?.get('workflow_events'),
    );
    server.registerTool(
        'workflow_events',
        {
            description:
                operationDescription(WORKFLOW_EVENTS_TABLE) +
                allowedValuesNote(operationValues, WORKFLOW_EVENTS_OPERATIONS),
            inputSchema: {
                operation: z.enum(WORKFLOW_EVENTS_OPERATIONS),
                ...operationInput(WORKFLOW_EVENTS_TABLE, WORKFLOW_EVENTS_INPUT_FIELDS),
            },
        },
        async (input) => asTextResult(await runOperation(WORKFLOW_EVENTS_TABLE, input.operation, ctx, input)),
    );
}
