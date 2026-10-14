import { requireValue } from './op-helpers.js';
// Flow lifecycle, configuration, validation and execution operations.

import {
    manageFlowExecutionScreenshotSchema,
    manageFlowUpdateSchema,
    manageFlowDeleteSchema,
    manageFlowActivateSchema,
    manageFlowRunSchema,
    manageFlowValidateSchema,
    manageFlowVerifySchema,
    manageFlowDryRunSchema,
    manageFlowDeliveryOptionsSchema,
    manageFlowTemplateContextSchema,
    manageFlowListRepairsSchema,
    manageFlowUpdateActionSchema,
    manageFlowDeleteActionSchema,
    manageFlowUpdateTriggerSchema,
    manageFlowDeleteTriggerSchema,
    manageFlowFireTriggerSchema,
    manageFlowAbortExecutionSchema,
} from '../backend/workflows.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
import { replaceActionsNeedsExistingLookup, resolveReplaceActionKeys } from './step-key.js';

export const MANAGE_FLOW_OPERATIONS = [
    'execution_screenshot',
    'clone',
    'unblock',
    'add_action',
    'remove_action',
    'replace_actions',
    'execution_metrics',
    'update',
    'delete',
    'activate',
    'run',
    'validate',
    'verify',
    'dry_run',
    'capacity',
    'delivery_options',
    'template_context',
    'list_repairs',
    'update_action',
    'delete_action',
    'update_trigger',
    'delete_trigger',
    'fire_trigger',
    'abort_execution',
] as const;
const manageFlowOperationSchema = z.enum(MANAGE_FLOW_OPERATIONS);

const flowActionOverridesSchema = z
    .object({ params: z.record(z.string(), z.unknown()).optional() })
    .nullable()
    .optional();

const flowChildActionInputSchema = z.object({
    actionId: z.string(),
    position: z.number().int().min(0),
    recordingEnabled: z.boolean().optional(),
    continueOnError: z.boolean().optional(),
    nameOverride: z.string().optional(),
    overrides: flowActionOverridesSchema,
    key: z
        .string()
        .optional()
        .describe(
            'Stable per-step id (^[a-z_][a-z0-9_-]{0,63}$). For operation=replace_actions: omit it to have this ' +
                'tool carry over the key of the existing step matching flowActionId, or at the same position with the ' +
                'same actionId, and derive a new one for genuinely new steps. When reordering or inserting steps, pass ' +
                'flowActionId (or key) for every step you are keeping — an unidentified step is always treated as new ' +
                'rather than risking a wrong carry-over onto a shifted position.',
        ),
    flowActionId: z
        .string()
        .optional()
        .describe(
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
    [key: string]: unknown;
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


async function executeManageFlowOperation(input: ManageFlowInput, ctx: ToolCtx): Promise<unknown> {
    if (input.operation === 'execution_screenshot')
        return ctx.backend.workflows.manageFlowExecutionScreenshot(
            manageFlowExecutionScreenshotSchema.strip().parse(input),
        );
    if (input.operation === 'update')
        return ctx.backend.workflows.manageFlowUpdate(manageFlowUpdateSchema.strip().parse(input));
    if (input.operation === 'delete')
        return ctx.backend.workflows.manageFlowDelete(manageFlowDeleteSchema.strip().parse(input));
    if (input.operation === 'activate')
        return ctx.backend.workflows.manageFlowActivate(manageFlowActivateSchema.strip().parse(input));
    if (input.operation === 'run') return ctx.backend.workflows.manageFlowRun(manageFlowRunSchema.strip().parse(input));
    if (input.operation === 'validate')
        return ctx.backend.workflows.manageFlowValidate(manageFlowValidateSchema.strip().parse(input));
    if (input.operation === 'verify')
        return ctx.backend.workflows.manageFlowVerify(manageFlowVerifySchema.strip().parse(input));
    if (input.operation === 'dry_run')
        return ctx.backend.workflows.manageFlowDryRun(manageFlowDryRunSchema.strip().parse(input));
    if (input.operation === 'capacity') return ctx.backend.workflows.manageFlowCapacity();
    if (input.operation === 'delivery_options')
        return ctx.backend.workflows.manageFlowDeliveryOptions(manageFlowDeliveryOptionsSchema.strip().parse(input));
    if (input.operation === 'template_context')
        return ctx.backend.workflows.manageFlowTemplateContext(manageFlowTemplateContextSchema.strip().parse(input));
    if (input.operation === 'list_repairs')
        return ctx.backend.workflows.manageFlowListRepairs(manageFlowListRepairsSchema.strip().parse(input));
    if (input.operation === 'update_action')
        return ctx.backend.workflows.manageFlowUpdateAction(manageFlowUpdateActionSchema.strip().parse(input));
    if (input.operation === 'delete_action')
        return ctx.backend.workflows.manageFlowDeleteAction(manageFlowDeleteActionSchema.strip().parse(input));
    if (input.operation === 'update_trigger')
        return ctx.backend.workflows.manageFlowUpdateTrigger(manageFlowUpdateTriggerSchema.strip().parse(input));
    if (input.operation === 'delete_trigger')
        return ctx.backend.workflows.manageFlowDeleteTrigger(manageFlowDeleteTriggerSchema.strip().parse(input));
    if (input.operation === 'fire_trigger')
        return ctx.backend.workflows.manageFlowFireTrigger(manageFlowFireTriggerSchema.strip().parse(input));
    if (input.operation === 'abort_execution')
        return ctx.backend.workflows.manageFlowAbortExecution(manageFlowAbortExecutionSchema.strip().parse(input));
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
        const flowId = requireValue(input.flowId, 'flowId', operation, 'manage_flow');
        return backend.cloneFlow({ flowId, name: input.name, deviceIds: input.deviceIds });
    }

    if (operation === 'unblock') {
        return backend.unblockFlow(requireValue(input.flowId, 'flowId', operation, 'manage_flow'));
    }

    if (operation === 'add_action') {
        const flowId = requireValue(input.flowId, 'flowId', operation, 'manage_flow');
        return backend.addFlowAction({
            flowId,
            actionId: requireValue(input.actionId, 'actionId', operation, 'manage_flow'),
            position: requireValue(input.position, 'position', operation, 'manage_flow'),
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
            flowActionId: requireValue(input.flowActionId, 'flowActionId', operation, 'manage_flow'),
            flowId: requireValue(input.flowId, 'flowId', operation, 'manage_flow'),
        });
    }

    // operation === 'replace_actions'
    const flowId = requireValue(input.flowId, 'flowId', operation, 'manage_flow');
    const actions = z.array(flowActionBindingSchema).parse(requireValue(input.actions, 'actions', operation, 'manage_flow'));
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
                "replace_actions (flowId, actions[] — replaces the ENTIRE action list for the flow; each action's optional key is " +
                'carried over from the existing step matching flowActionId, or at the same position with the same actionId, when ' +
                'omitted, and derived for genuinely new steps; when reordering or inserting steps, pass key or flowActionId for ' +
                'every step you are keeping so it is recognized as an existing step), ' +
                'execution_metrics (optional flowId/triggerId/from/to — aggregate execution stats, not a single execution; ' +
                'use get_workflow_resource(resource="execution") for one execution). ' +
                'Check the flow\'s templateResolutionVersion (get_workflow_resource(resource="flow")): on version 3, an action\'s ' +
                'overrides.params may reference another step only as {{steps.<key>.body.<field>}} ({{event.payload.*}} for the ' +
                'triggering event); older flows use name/slug-based references instead. ' +
                'Use dry_run to simulate one flow, or workflow_events(operation="dry_run") to simulate event routing without side effects.' +
                ' Additional operations: update: Update flow configuration. delete: Delete a flow. activate: Activate a flow; may start paid automation. run: Start a flow execution; usage may be billed. validate: Validate a draft flow without saving it. verify: Verify flow configuration. dry_run: Simulate a flow without executing actions. capacity: Read included flow capacity. delivery_options: Read available delivery options. template_context: Read template variables. list_repairs: Read suggested flow repairs. update_action: Update a workflow action. delete_action: Delete a workflow action. update_trigger: Update a workflow trigger. delete_trigger: Delete a workflow trigger. fire_trigger: Fire a workflow trigger. abort_execution: Abort a running execution.' +
                ' execution_screenshot: Read a short-lived signed download URL.' +
                allowedValuesNote(operationValues, MANAGE_FLOW_OPERATIONS),
            inputSchema: {
                // Enum stays the FULL set — dispatch-time rejection in register.ts
                // is the actual enforcement point (see tools/webhooks.ts for why).
                operation: manageFlowOperationSchema,
                ...manageFlowExecutionScreenshotSchema.partial().shape,
                ...manageFlowUpdateSchema.partial().shape,
                ...manageFlowDeleteSchema.partial().shape,
                ...manageFlowActivateSchema.partial().shape,
                ...manageFlowRunSchema.partial().shape,
                ...manageFlowValidateSchema.partial().shape,
                ...manageFlowVerifySchema.partial().shape,
                ...manageFlowDryRunSchema.partial().shape,
                ...manageFlowDeliveryOptionsSchema.partial().shape,
                ...manageFlowTemplateContextSchema.partial().shape,
                ...manageFlowListRepairsSchema.partial().shape,
                ...manageFlowUpdateActionSchema.partial().shape,
                ...manageFlowDeleteActionSchema.partial().shape,
                ...manageFlowUpdateTriggerSchema.partial().shape,
                ...manageFlowDeleteTriggerSchema.partial().shape,
                ...manageFlowFireTriggerSchema.partial().shape,
                ...manageFlowAbortExecutionSchema.partial().shape,
                delivery: manageFlowUpdateSchema.shape.delivery,
                flowId: z.string().optional(),
                name: z
                    .string()
                    .optional()
                    .describe('New flow name for operation=clone; defaults to a server-generated copy name.'),
                deviceIds: z
                    .array(z.string())
                    .optional()
                    .describe("Target devices for operation=clone; defaults to the source flow's devices."),
                actionId: z.string().optional(),
                position: z.number().int().min(0).optional(),
                key: z
                    .string()
                    .optional()
                    .describe(
                        'operation=add_action only: stable per-step id (^[a-z_][a-z0-9_-]{0,63}$), used to reference this ' +
                            "step's output from later steps. Derived from the action if omitted.",
                    ),
                continueOnError: z.boolean().optional(),
                nameOverride: z.string().optional(),
                overrides: flowActionOverridesSchema,
                parentFlowActionId: z
                    .string()
                    .nullable()
                    .optional()
                    .describe('Nest under this flow-action id (loop/branch parent) for operation=add_action.'),
                children: z
                    .array(flowChildActionInputSchema)
                    .optional()
                    .describe('Nested loop/branch child actions for operation=add_action.'),
                flowActionId: z
                    .string()
                    .optional()
                    .describe('The flow-action binding id (not the actionId) for operation=remove_action.'),
                actions: z
                    .union([z.array(flowActionBindingSchema), manageFlowValidateSchema.shape.actions])
                    .optional()
                    .describe('Full replacement action list for operation=replace_actions.'),
                triggerId: z.string().optional().describe('Filter for operation=execution_metrics.'),
                from: z
                    .string()
                    .nullable()
                    .optional()
                    .describe('ISO 8601 range start for operation=execution_metrics.'),
                to: z.string().nullable().optional().describe('ISO 8601 range end for operation=execution_metrics.'),
            },
        },
        async (input) => asTextResult(await executeManageFlowOperation(input as ManageFlowInput, ctx)),
    );
}
