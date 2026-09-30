// Event ingestion/simulation and the app-event catalog's write path
// (registering new event types), distinct from
// list_workflow_resources(resource="app_event_catalog") which only reads it.
// All four operations map 1:1 onto @mobilerun/sdk methods (verified against
// the shipped workflows/events/*.d.ts):
//   ingest           -> client.workflows.events.ingest
//   dry_run          -> client.workflows.events.dryRun (simulate against ALL
//                        flows — there is no per-flow dry-run; see the note
//                        in manage-flow.ts)
//   list_event_types -> client.appEvents.catalog.list (static catalog)
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

const WORKFLOW_EVENTS_OPERATIONS = ['ingest', 'dry_run', 'list_event_types'] as const;
const workflowEventsOperationSchema = z.enum(WORKFLOW_EVENTS_OPERATIONS);

type WorkflowEventsInput = {
    operation: z.infer<typeof workflowEventsOperationSchema>;
    eventType?: string;
    payload?: Record<string, unknown>;
};

function requireValue<T>(value: T | undefined, name: string, operation: string): T {
    if (value === undefined) throw new Error(`workflow_events operation=${operation} requires ${name}`);
    return value;
}

export async function executeWorkflowEventsOperation(input: WorkflowEventsInput, ctx: ToolCtx): Promise<unknown> {
    const { operation } = input;
    const backend = ctx.backend.workflows;

    if (operation === 'list_event_types') {
        return backend.listAppEventCatalog();
    }

    const eventType = requireValue(input.eventType, 'eventType', operation);
    if (operation === 'ingest') return backend.ingestEvent({ eventType, payload: input.payload });
    // operation === 'dry_run'
    return backend.dryRunEvent({ eventType, payload: input.payload });
}

export function registerWorkflowEventsTool(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(WORKFLOW_EVENTS_OPERATIONS, ctx.policy.operationAllowlist?.get('workflow_events'));

    server.registerTool(
        'workflow_events',
        {
            description:
                'Ingest, simulate, and catalog custom app/system events for trigger evaluation. Operations: ' +
                'ingest (eventType, optional payload — enqueues for trigger evaluation, returns immediately with an eventId), ' +
                'dry_run (eventType, optional payload — simulates against ALL configured flows, no side effects: returns which ' +
                'flows would fire, their gates, and payload validation errors), ' +
                'list_event_types (read-only static app event catalog). ' +
                'Call list_event_types or list_workflow_resources(resource="app_event_catalog") before ingest/dry_run to confirm ' +
                'eventType and payload shape — never guess an app.*/system.* type.' +
                allowedValuesNote(operationValues, WORKFLOW_EVENTS_OPERATIONS),
            inputSchema: {
                // Enum stays the FULL set — dispatch-time rejection in register.ts
                // is the actual enforcement point (see tools/webhooks.ts for why).
                operation: workflowEventsOperationSchema,
                eventType: z.string().optional(),
                payload: z.record(z.string(), z.unknown()).optional(),
            },
        },
        async (input) => asTextResult(await executeWorkflowEventsOperation(input as WorkflowEventsInput, ctx)),
    );
}
