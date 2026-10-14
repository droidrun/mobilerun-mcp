import { operation, registerBundle, requireValue, sdkOp } from './operation-table.js';
// Flow lifecycle, configuration, validation and execution operations.
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
    manageFlowAbortExecutionSchema,
    manageFlowActivateSchema,
    manageFlowDeleteActionSchema,
    manageFlowDeleteSchema,
    manageFlowDeleteTriggerSchema,
    manageFlowDeliveryOptionsSchema,
    manageFlowDryRunSchema,
    manageFlowExecutionScreenshotSchema,
    manageFlowFireTriggerSchema,
    manageFlowListRepairsSchema,
    manageFlowRunSchema,
    manageFlowTemplateContextSchema,
    manageFlowUpdateActionSchema,
    manageFlowUpdateSchema,
    manageFlowUpdateTriggerSchema,
    manageFlowValidateSchema,
    manageFlowVerifySchema,
} from '../backend/workflows.js';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { replaceActionsNeedsExistingLookup, resolveReplaceActionKeys } from './step-key.js';
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
const MANAGE_FLOW_SHARED_FIELDS = {
    delivery: manageFlowUpdateSchema.shape.delivery,
    flowId: z.string().optional(),
    name: z.string().optional().describe('New flow name for operation=clone; defaults to a server-generated copy name.'),
    deviceIds: z.array(z.string()).optional().describe("Target devices for operation=clone; defaults to the source flow's devices."),
    actionId: z.string().optional(),
    actions: z
        .union([z.array(flowActionBindingSchema), manageFlowValidateSchema.shape.actions])
        .optional()
        .describe('Full replacement action list for operation=replace_actions.'),
    triggerId: z.string().optional().describe('Filter for operation=execution_metrics.'),
};

const MANAGE_FLOW_INTRO =
    'Flow lifecycle operations beyond create_flow. Check the flow\'s templateResolutionVersion (get_workflow_resource(resource="flow")): on version 3, an action\'s overrides.params may reference another step only as {{steps.<key>.body.<field>}} ({{event.payload.*}} for the triggering event); older flows use name/slug-based references instead.';
export const MANAGE_FLOW_TABLE = [
    sdkOp(
        'execution_screenshot',
        manageFlowExecutionScreenshotSchema,
        (ctx, params) => ctx.backend.workflows.manageFlowExecutionScreenshot(params),
        'read',
        { doc: 'Read a short-lived signed download URL.' },
    ),
    operation({
        op: 'clone',
        input: {
            flowId: MANAGE_FLOW_SHARED_FIELDS.flowId,
            name: MANAGE_FLOW_SHARED_FIELDS.name,
            deviceIds: MANAGE_FLOW_SHARED_FIELDS.deviceIds,
        },
        access: 'write',
        doc: 'Copy a flow (flowId, optional name/deviceIds).',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.workflows.cloneFlow({
                    flowId: requireValue(input.flowId, 'flowId', input.operation, 'manage_flow'),
                    name: input.name,
                    deviceIds: input.deviceIds,
                }),
            ),
    }),
    operation({
        op: 'unblock',
        input: { flowId: MANAGE_FLOW_SHARED_FIELDS.flowId },
        access: 'write',
        doc: 'Clear blocked status after fixing the underlying issue (flowId, idempotent).',
        run: async (ctx, input) =>
            asTextResult(await ctx.backend.workflows.unblockFlow(requireValue(input.flowId, 'flowId', input.operation, 'manage_flow'))),
    }),
    operation({
        op: 'add_action',
        input: {
            flowId: MANAGE_FLOW_SHARED_FIELDS.flowId,
            actionId: MANAGE_FLOW_SHARED_FIELDS.actionId,
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
            children: z.array(flowChildActionInputSchema).optional().describe('Nested loop/branch child actions for operation=add_action.'),
        },
        access: 'write',
        doc: 'Add a step (flowId, actionId, position, optional key/continueOnError/nameOverride/overrides/parentFlowActionId/children). The key is derived from the step if omitted.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.workflows.addFlowAction({
                    flowId: requireValue(input.flowId, 'flowId', input.operation, 'manage_flow'),
                    actionId: requireValue(input.actionId, 'actionId', input.operation, 'manage_flow'),
                    position: requireValue(input.position, 'position', input.operation, 'manage_flow'),
                    key: input.key,
                    continueOnError: input.continueOnError,
                    nameOverride: input.nameOverride,
                    overrides: input.overrides,
                    parentFlowActionId: input.parentFlowActionId,
                    children: input.children,
                }),
            ),
    }),
    operation({
        op: 'remove_action',
        input: {
            flowActionId: z.string().optional().describe('The flow-action binding id (not the actionId) for operation=remove_action.'),
            flowId: MANAGE_FLOW_SHARED_FIELDS.flowId,
        },
        access: 'write',
        doc: 'Remove a step (flowActionId, flowId).',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.workflows.removeFlowAction({
                    flowActionId: requireValue(input.flowActionId, 'flowActionId', input.operation, 'manage_flow'),
                    flowId: requireValue(input.flowId, 'flowId', input.operation, 'manage_flow'),
                }),
            ),
    }),
    operation({
        op: 'replace_actions',
        input: { flowId: MANAGE_FLOW_SHARED_FIELDS.flowId, actions: MANAGE_FLOW_SHARED_FIELDS.actions },
        access: 'write',
        doc: 'Replace the ENTIRE action list (flowId, actions[]). An omitted key is carried over from the existing step matching flowActionId, or at the same position with the same actionId, and derived for genuinely new steps. When reordering or inserting steps, pass key or flowActionId for every step you are keeping so it is recognized as existing.',
        run: async (ctx, input) => {
            // operation === 'replace_actions'
            const flowId = requireValue(input.flowId, 'flowId', input.operation, 'manage_flow');
            const actions = z.array(flowActionBindingSchema).parse(requireValue(input.actions, 'actions', input.operation, 'manage_flow'));
            // Every node needs a key on a flow whose templateResolutionVersion is 3
            // (the server rejects a full replace missing one there; harmless on
            // v1/v2 flows, which still derive missing keys server-side). A caller-
            // supplied key always wins; otherwise carry over the existing step's key
            // (matched by flowActionId, else by position) or derive a fresh one —
            // see step-key.ts. Only fetched when actually needed.
            const resolvedActions = replaceActionsNeedsExistingLookup(actions)
                ? resolveReplaceActionKeys(actions, (await ctx.backend.workflows.listFlowActions(flowId)).items)
                : actions;
            return asTextResult(await ctx.backend.workflows.replaceFlowActions({ flowId, actions: resolvedActions }));
        },
    }),
    operation({
        op: 'execution_metrics',
        input: {
            flowId: MANAGE_FLOW_SHARED_FIELDS.flowId,
            triggerId: MANAGE_FLOW_SHARED_FIELDS.triggerId,
            from: z.string().nullable().optional().describe('ISO 8601 range start for operation=execution_metrics.'),
            to: z.string().nullable().optional().describe('ISO 8601 range end for operation=execution_metrics.'),
        },
        access: 'read',
        doc: 'Aggregate execution stats (optional flowId/triggerId/from/to), not a single execution; use get_workflow_resource(resource="execution") for one execution.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.workflows.getExecutionMetrics({
                    flowId: input.flowId,
                    triggerId: input.triggerId,
                    from: input.from,
                    to: input.to,
                }),
            ),
    }),
    sdkOp('update', manageFlowUpdateSchema, (ctx, params) => ctx.backend.workflows.manageFlowUpdate(params), 'write', {
        doc: 'Update flow configuration.',
        effectiveOp: (input) => (input.enabled === true || input.lifecycleStatus === 'enabled' ? 'activate' : 'update'),
    }),
    sdkOp('delete', manageFlowDeleteSchema, (ctx, params) => ctx.backend.workflows.manageFlowDelete(params), 'write', {
        doc: 'Delete a flow.',
    }),
    sdkOp('activate', manageFlowActivateSchema, (ctx, params) => ctx.backend.workflows.manageFlowActivate(params), 'commerce', {
        doc: 'Activate a flow; may start paid automation.',
    }),
    sdkOp('run', manageFlowRunSchema, (ctx, params) => ctx.backend.workflows.manageFlowRun(params), 'commerce', {
        doc: 'Start a flow execution; usage may be billed.',
    }),
    sdkOp('validate', manageFlowValidateSchema, (ctx, params) => ctx.backend.workflows.manageFlowValidate(params), 'read', {
        doc: 'Validate a draft flow without saving it.',
    }),
    sdkOp('verify', manageFlowVerifySchema, (ctx, params) => ctx.backend.workflows.manageFlowVerify(params), 'commerce', {
        doc: 'Verify flow configuration.',
    }),
    sdkOp('dry_run', manageFlowDryRunSchema, (ctx, params) => ctx.backend.workflows.manageFlowDryRun(params), 'read', {
        doc: 'Simulate one flow without executing actions. Use workflow_events(operation="dry_run") to simulate event routing without side effects.',
    }),
    sdkOp('capacity', z.object({}), (ctx) => ctx.backend.workflows.manageFlowCapacity(), 'read', {
        doc: 'Read included flow capacity.',
    }),
    sdkOp(
        'delivery_options',
        manageFlowDeliveryOptionsSchema,
        (ctx, params) => ctx.backend.workflows.manageFlowDeliveryOptions(params),
        'read',
        { doc: 'Read available delivery options.' },
    ),
    sdkOp(
        'template_context',
        manageFlowTemplateContextSchema,
        (ctx, params) => ctx.backend.workflows.manageFlowTemplateContext(params),
        'read',
        { doc: 'Read template variables.' },
    ),
    sdkOp('list_repairs', manageFlowListRepairsSchema, (ctx, params) => ctx.backend.workflows.manageFlowListRepairs(params), 'read', {
        doc: 'Read suggested flow repairs.',
    }),
    sdkOp('update_action', manageFlowUpdateActionSchema, (ctx, params) => ctx.backend.workflows.manageFlowUpdateAction(params), 'write', {
        doc: 'Update a workflow action.',
    }),
    sdkOp('delete_action', manageFlowDeleteActionSchema, (ctx, params) => ctx.backend.workflows.manageFlowDeleteAction(params), 'write', {
        doc: 'Delete a workflow action.',
    }),
    sdkOp(
        'update_trigger',
        manageFlowUpdateTriggerSchema,
        (ctx, params) => ctx.backend.workflows.manageFlowUpdateTrigger(params),
        'write',
        { doc: 'Update a workflow trigger.' },
    ),
    sdkOp(
        'delete_trigger',
        manageFlowDeleteTriggerSchema,
        (ctx, params) => ctx.backend.workflows.manageFlowDeleteTrigger(params),
        'write',
        { doc: 'Delete a workflow trigger.' },
    ),
    sdkOp('fire_trigger', manageFlowFireTriggerSchema, (ctx, params) => ctx.backend.workflows.manageFlowFireTrigger(params), 'commerce', {
        doc: 'Fire a workflow trigger.',
    }),
    sdkOp(
        'abort_execution',
        manageFlowAbortExecutionSchema,
        (ctx, params) => ctx.backend.workflows.manageFlowAbortExecution(params),
        'write',
        { doc: 'Abort a running execution.' },
    ),
] as const;

export function registerManageFlowTool(server: McpServer, ctx: ToolCtx): void {
    registerBundle(server, ctx, 'manage_flow', MANAGE_FLOW_TABLE, {
        intro: MANAGE_FLOW_INTRO,
        shared: MANAGE_FLOW_SHARED_FIELDS,
    });
}
