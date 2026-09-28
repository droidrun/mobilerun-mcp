// Flow-lifecycle operations beyond create_flow / list_workflow_resources /
// get_workflow_resource.
//
// This bundle's `operation` enum was originally scoped wider: clone,
// dry_run, unblock, list_repairs, add_action, remove_action, replace_actions,
// abort_execution, execution_metrics (9 ops). Verified against
// @mobilerun/sdk's shipped workflows/flows/*.d.ts and workflows/executions.d.ts
// — three have no corresponding SDK method and are DROPPED here (a
// deliberate omission, not an oversight):
//   - dry_run: the SDK's only dry-run surface is client.workflows.events.dryRun
//     (simulate an EVENT against all flows) — there is no per-flow dry-run
//     endpoint. That operation lives on `workflow_events` instead (its
//     `dry_run` operation), which is the actual matching SDK capability.
//   - list_repairs / abort_execution: no SDK method exists for either
//     (grepped the full shipped .d.ts tree — no repair-candidate listing, no
//     execution cancel/abort; FlowExecution.status includes 'cancelled' as a
//     terminal *state* but nothing sets it from the client). Not a
//     chat-harness-style repair-candidate concept either — that's a
//     separate feature outside this package's scope.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
import { replaceActionsNeedsExistingLookup, resolveReplaceActionKeys } from './step-key.js';

const MANAGE_FLOW_OPERATIONS = ['clone', 'unblock', 'add_action', 'remove_action', 'replace_actions', 'execution_metrics'] as const;
const manageFlowOperationSchema = z.enum(MANAGE_FLOW_OPERATIONS);

const flowActionOverridesSchema = z
    .object({ params: z.record(z.string(), z.unknown()).optional() })
    .nullable()
    .optional();

const flowChildActionInputSchema = z.object({
    actionId: z.string(),
    position: z.number().int().min(0),
    continueOnError: z.boolean().optional(),
    nameOverride: z.string().optional(),
    overrides: flowActionOverridesSchema,
    key: z.string().optional().describe(
        'Stable per-step id (^[a-z_][a-z0-9_-]{0,63}$). For operation=replace_actions: omit it to have this ' +
            'tool carry over the key of the existing step matching flowActionId, or at the same position with the ' +
            'same actionId, and derive a new one for genuinely new steps. When reordering or inserting steps, pass ' +
            'flowActionId (or key) for every step you are keeping — an unidentified step is always treated as new ' +
            'rather than risking a wrong carry-over onto a shifted position.',
    ),
    flowActionId: z.string().optional().describe(
        'operation=replace_actions only: the existing flow-action binding id this node replaces (from a prior ' +
            'add_action/create_flow/replace_actions response), used to carry over its key when key is omitted — ' +
            'the reliable way to identify a kept step when reordering or inserting.',
    ),
});
const flowActionBindingSchema = flowChildActionInputSchema.extend({
    children: z.array(flowChildActionInputSchema).optional(),
});

type ManageFlowInput = {
    operation: z.infer<typeof manageFlowOperationSchema>;
    flowId?: string;
    name?: string;
    deviceIds?: string[];
    actionId?: string;
    position?: number;
    key?: string;
    continueOnError?: boolean;
    nameOverride?: string;
    overrides?: { params?: Record<string, unknown> } | null;
    parentFlowActionId?: string | null;
    children?: z.infer<typeof flowChildActionInputSchema>[];
    flowActionId?: string;
    actions?: z.infer<typeof flowActionBindingSchema>[];
    triggerId?: string;
    from?: string | null;
    to?: string | null;
};

function requireValue<T>(value: T | undefined, name: string, operation: string): T {
    if (value === undefined) throw new Error(`manage_flow operation=${operation} requires ${name}`);
    return value;
}

export async function executeManageFlowOperation(input: ManageFlowInput, ctx: ToolCtx): Promise<unknown> {
    const { operation } = input;
    const backend = ctx.backend.workflows;

    if (operation === 'execution_metrics') {
        return backend.getExecutionMetrics({
            flowId: input.flowId,
            triggerId: input.triggerId,
            from: input.from,
            to: input.to,
        });
    }

    if (operation === 'clone') {
        const flowId = requireValue(input.flowId, 'flowId', operation);
        return backend.cloneFlow({ flowId, name: input.name, deviceIds: input.deviceIds });
    }

    if (operation === 'unblock') {
        return backend.unblockFlow(requireValue(input.flowId, 'flowId', operation));
    }

    if (operation === 'add_action') {
        const flowId = requireValue(input.flowId, 'flowId', operation);
        return backend.addFlowAction({
            flowId,
            actionId: requireValue(input.actionId, 'actionId', operation),
            position: requireValue(input.position, 'position', operation),
            key: input.key,
            continueOnError: input.continueOnError,
            nameOverride: input.nameOverride,
            overrides: input.overrides,
            parentFlowActionId: input.parentFlowActionId,
            children: input.children,
        });
    }

    if (operation === 'remove_action') {
        return backend.removeFlowAction({
            flowActionId: requireValue(input.flowActionId, 'flowActionId', operation),
            flowId: requireValue(input.flowId, 'flowId', operation),
        });
    }

    // operation === 'replace_actions'
    const flowId = requireValue(input.flowId, 'flowId', operation);
    const actions = requireValue(input.actions, 'actions', operation);
    // Every node needs a key on a flow whose templateResolutionVersion is 3
    // (the server rejects a full replace missing one there; harmless on
    // v1/v2 flows, which still derive missing keys server-side). A caller-
    // supplied key always wins; otherwise carry over the existing step's key
    // (matched by flowActionId, else by position) or derive a fresh one —
    // see step-key.ts. Only fetched when actually needed.
    const resolvedActions = replaceActionsNeedsExistingLookup(actions)
        ? resolveReplaceActionKeys(actions, (await backend.listFlowActions(flowId)).items)
        : actions;
    return backend.replaceFlowActions({ flowId, actions: resolvedActions });
}

export function registerManageFlowTool(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(MANAGE_FLOW_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_flow'));

    server.registerTool(
        'manage_flow',
        {
            description:
                'Flow lifecycle operations beyond create_flow. Operations: clone (flowId, optional name/deviceIds — copies a flow), ' +
                'unblock (flowId — clears blocked status after fixing the underlying issue, idempotent), ' +
                'add_action (flowId, actionId, position, optional key/continueOnError/nameOverride/overrides/parentFlowActionId/children — ' +
                'key is derived from the step if omitted), ' +
                'remove_action (flowActionId, flowId), ' +
                'replace_actions (flowId, actions[] — replaces the ENTIRE action list for the flow; each action\'s optional key is ' +
                'carried over from the existing step matching flowActionId, or at the same position with the same actionId, when ' +
                'omitted, and derived for genuinely new steps; when reordering or inserting steps, pass key or flowActionId for ' +
                'every step you are keeping so it is not mistaken for a new one), ' +
                'execution_metrics (optional flowId/triggerId/from/to — aggregate execution stats, not a single execution; ' +
                'use get_workflow_resource(resource="execution") for one execution). ' +
                'Check the flow\'s templateResolutionVersion (get_workflow_resource(resource="flow")): on version 3, an action\'s ' +
                'overrides.params may reference another step only as {{steps.<key>.body.<field>}} ({{event.payload.*}} for the ' +
                'triggering event); older flows use name/slug-based references instead. ' +
                'To simulate an event against flows without side effects, use workflow_events(operation="dry_run") instead — ' +
                'there is no per-flow dry-run.' +
                allowedValuesNote(operationValues, MANAGE_FLOW_OPERATIONS),
            inputSchema: {
                // Enum stays the FULL set — dispatch-time rejection in register.ts
                // is the actual enforcement point (see tools/webhooks.ts for why).
                operation: manageFlowOperationSchema,
                flowId: z.string().optional(),
                name: z.string().optional().describe('New flow name for operation=clone; defaults to a server-generated copy name.'),
                deviceIds: z.array(z.string()).optional().describe('Target devices for operation=clone; defaults to the source flow\'s devices.'),
                actionId: z.string().optional(),
                position: z.number().int().min(0).optional(),
                key: z.string().optional().describe(
                    'operation=add_action only: stable per-step id (^[a-z_][a-z0-9_-]{0,63}$), used to reference this ' +
                        'step\'s output from later steps. Derived from the action if omitted.',
                ),
                continueOnError: z.boolean().optional(),
                nameOverride: z.string().optional(),
                overrides: flowActionOverridesSchema,
                parentFlowActionId: z.string().nullable().optional().describe('Nest under this flow-action id (loop/branch parent) for operation=add_action.'),
                children: z.array(flowChildActionInputSchema).optional().describe('Nested loop/branch child actions for operation=add_action.'),
                flowActionId: z.string().optional().describe('The flow-action binding id (not the actionId) for operation=remove_action.'),
                actions: z.array(flowActionBindingSchema).optional().describe('Full replacement action list for operation=replace_actions.'),
                triggerId: z.string().optional().describe('Filter for operation=execution_metrics.'),
                from: z.string().nullable().optional().describe('ISO 8601 range start for operation=execution_metrics.'),
                to: z.string().nullable().optional().describe('ISO 8601 range end for operation=execution_metrics.'),
            },
        },
        async (input) => asTextResult(await executeManageFlowOperation(input as ManageFlowInput, ctx)),
    );
}
