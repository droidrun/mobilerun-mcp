import {
    operation,
    operationValues,
    operationInput,
    operationDescription,
    runOperation,
} from './operation-table.js';
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
    name: z
        .string()
        .optional()
        .describe('New flow name for operation=clone; defaults to a server-generated copy name.'),
    deviceIds: z
        .array(z.string())
        .optional()
        .describe("Target devices for operation=clone; defaults to the source flow's devices."),
    actionId: z.string().optional(),
    actions: z
        .union([z.array(flowActionBindingSchema), manageFlowValidateSchema.shape.actions])
        .optional()
        .describe('Full replacement action list for operation=replace_actions.'),
    triggerId: z.string().optional().describe('Filter for operation=execution_metrics.'),
};

export const MANAGE_FLOW_TABLE = [
    operation({
        op: 'execution_screenshot',
        input: { ...manageFlowExecutionScreenshotSchema.partial().shape },
        access: 'read',
        describe: { order: 23, text: 'execution_screenshot: Read a short-lived signed download URL.' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowExecutionScreenshot(
                manageFlowExecutionScreenshotSchema.strip().parse(input),
            );
        },
    }),
    operation({
        op: 'clone',
        input: { flowId: MANAGE_FLOW_SHARED_FIELDS.flowId, name: MANAGE_FLOW_SHARED_FIELDS.name, deviceIds: MANAGE_FLOW_SHARED_FIELDS.deviceIds },
        access: 'write',
        describe: {
            order: 0,
            text: 'Flow lifecycle operations beyond create_flow. Operations: clone (flowId, optional name/deviceIds — copies a flow), ',
        },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.workflows;
            const flowId = requireValue(input.flowId, 'flowId', operation, 'manage_flow');
            return backend.cloneFlow({ flowId, name: input.name, deviceIds: input.deviceIds });
        },
    }),
    operation({
        op: 'unblock',
        input: { flowId: MANAGE_FLOW_SHARED_FIELDS.flowId },
        access: 'write',
        describe: {
            order: 1,
            text: 'unblock (flowId — clears blocked status after fixing the underlying issue, idempotent), ',
        },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.workflows;
            return backend.unblockFlow(requireValue(input.flowId, 'flowId', operation, 'manage_flow'));
        },
    }),
    operation({
        op: 'add_action',
        input: { flowId: MANAGE_FLOW_SHARED_FIELDS.flowId, actionId: MANAGE_FLOW_SHARED_FIELDS.actionId, position: z.number().int().min(0).optional(), key: z
        .string()
        .optional()
        .describe(
            'operation=add_action only: stable per-step id (^[a-z_][a-z0-9_-]{0,63}$), used to reference this ' +
                "step's output from later steps. Derived from the action if omitted.",
        ), continueOnError: z.boolean().optional(), nameOverride: z.string().optional(), overrides: flowActionOverridesSchema, parentFlowActionId: z
        .string()
        .nullable()
        .optional()
        .describe('Nest under this flow-action id (loop/branch parent) for operation=add_action.'), children: z
        .array(flowChildActionInputSchema)
        .optional()
        .describe('Nested loop/branch child actions for operation=add_action.') },
        access: 'write',
        describe: {
            order: 2,
            text: 'add_action (flowId, actionId, position, optional key/continueOnError/nameOverride/overrides/parentFlowActionId/children — key is derived from the step if omitted), ',
        },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.workflows;
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
        },
    }),
    operation({
        op: 'remove_action',
        input: { flowActionId: z
        .string()
        .optional()
        .describe('The flow-action binding id (not the actionId) for operation=remove_action.'), flowId: MANAGE_FLOW_SHARED_FIELDS.flowId },
        access: 'write',
        describe: { order: 3, text: 'remove_action (flowActionId, flowId), ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.workflows;
            return backend.removeFlowAction({
                flowActionId: requireValue(input.flowActionId, 'flowActionId', operation, 'manage_flow'),
                flowId: requireValue(input.flowId, 'flowId', operation, 'manage_flow'),
            });
        },
    }),
    operation({
        op: 'replace_actions',
        input: { flowId: MANAGE_FLOW_SHARED_FIELDS.flowId, actions: MANAGE_FLOW_SHARED_FIELDS.actions },
        access: 'write',
        describe: {
            order: 4,
            text: "replace_actions (flowId, actions[] — replaces the ENTIRE action list for the flow; each action's optional key is carried over from the existing step matching flowActionId, or at the same position with the same actionId, when omitted, and derived for genuinely new steps; when reordering or inserting steps, pass key or flowActionId for every step you are keeping so it is recognized as an existing step), ",
        },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.workflows;
            // operation === 'replace_actions'
            const flowId = requireValue(input.flowId, 'flowId', operation, 'manage_flow');
            const actions = z
                .array(flowActionBindingSchema)
                .parse(requireValue(input.actions, 'actions', operation, 'manage_flow'));
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
        },
    }),
    operation({
        op: 'execution_metrics',
        input: { flowId: MANAGE_FLOW_SHARED_FIELDS.flowId, triggerId: MANAGE_FLOW_SHARED_FIELDS.triggerId, from: z.string().nullable().optional().describe('ISO 8601 range start for operation=execution_metrics.'), to: z.string().nullable().optional().describe('ISO 8601 range end for operation=execution_metrics.') },
        access: 'read',
        describe: {
            order: 5,
            text: 'execution_metrics (optional flowId/triggerId/from/to — aggregate execution stats, not a single execution; use get_workflow_resource(resource="execution") for one execution). Check the flow\'s templateResolutionVersion (get_workflow_resource(resource="flow")): on version 3, an action\'s overrides.params may reference another step only as {{steps.<key>.body.<field>}} ({{event.payload.*}} for the triggering event); older flows use name/slug-based references instead. Use ',
        },
        run: async (ctx, input) => {
            const backend = ctx.backend.workflows;
            return backend.getExecutionMetrics({
                flowId: input.flowId,
                triggerId: input.triggerId,
                from: input.from,
                to: input.to,
            });
        },
    }),
    operation({
        op: 'update',
        input: { ...manageFlowUpdateSchema.partial().shape, flowId: MANAGE_FLOW_SHARED_FIELDS.flowId, delivery: MANAGE_FLOW_SHARED_FIELDS.delivery, deviceIds: MANAGE_FLOW_SHARED_FIELDS.deviceIds, name: MANAGE_FLOW_SHARED_FIELDS.name, triggerId: MANAGE_FLOW_SHARED_FIELDS.triggerId },
        access: 'write',
        describe: { order: 7, text: 'update: Update flow configuration. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowUpdate(manageFlowUpdateSchema.strip().parse(input));
        },
    }),
    operation({
        op: 'delete',
        input: { ...manageFlowDeleteSchema.partial().shape, flowId: MANAGE_FLOW_SHARED_FIELDS.flowId },
        access: 'write',
        describe: { order: 8, text: 'delete: Delete a flow. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowDelete(manageFlowDeleteSchema.strip().parse(input));
        },
    }),
    operation({
        op: 'activate',
        input: { ...manageFlowActivateSchema.partial().shape, flowId: MANAGE_FLOW_SHARED_FIELDS.flowId },
        access: 'commerce',
        describe: { order: 9, text: 'activate: Activate a flow; may start paid automation. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowActivate(manageFlowActivateSchema.strip().parse(input));
        },
    }),
    operation({
        op: 'run',
        input: { ...manageFlowRunSchema.partial().shape, flowId: MANAGE_FLOW_SHARED_FIELDS.flowId },
        access: 'commerce',
        describe: { order: 10, text: 'run: Start a flow execution; usage may be billed. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowRun(manageFlowRunSchema.strip().parse(input));
        },
    }),
    operation({
        op: 'validate',
        input: { ...manageFlowValidateSchema.partial().shape, actions: MANAGE_FLOW_SHARED_FIELDS.actions, name: MANAGE_FLOW_SHARED_FIELDS.name, delivery: MANAGE_FLOW_SHARED_FIELDS.delivery, deviceIds: MANAGE_FLOW_SHARED_FIELDS.deviceIds, triggerId: MANAGE_FLOW_SHARED_FIELDS.triggerId },
        access: 'read',
        describe: { order: 11, text: 'validate: Validate a draft flow without saving it. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowValidate(manageFlowValidateSchema.strip().parse(input));
        },
    }),
    operation({
        op: 'verify',
        input: { ...manageFlowVerifySchema.partial().shape, flowId: MANAGE_FLOW_SHARED_FIELDS.flowId },
        access: 'commerce',
        describe: {
            order: 12,
            text: 'verify: Verify flow configuration. dry_run: Simulate a flow without executing actions. ',
        },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowVerify(manageFlowVerifySchema.strip().parse(input));
        },
    }),
    operation({
        op: 'dry_run',
        input: { ...manageFlowDryRunSchema.partial().shape, flowId: MANAGE_FLOW_SHARED_FIELDS.flowId },
        access: 'read',
        describe: {
            order: 6,
            text: 'dry_run to simulate one flow, or workflow_events(operation="dry_run") to simulate event routing without side effects. Additional operations: ',
        },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowDryRun(manageFlowDryRunSchema.strip().parse(input));
        },
    }),
    operation({
        op: 'capacity',
        input: {  },
        access: 'read',
        describe: { order: 13, text: 'capacity: Read included flow capacity. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowCapacity();
        },
    }),
    operation({
        op: 'delivery_options',
        input: { ...manageFlowDeliveryOptionsSchema.partial().shape, flowId: MANAGE_FLOW_SHARED_FIELDS.flowId },
        access: 'read',
        describe: { order: 14, text: 'delivery_options: Read available delivery options. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowDeliveryOptions(
                manageFlowDeliveryOptionsSchema.strip().parse(input),
            );
        },
    }),
    operation({
        op: 'template_context',
        input: { ...manageFlowTemplateContextSchema.partial().shape },
        access: 'read',
        describe: { order: 15, text: 'template_context: Read template variables. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowTemplateContext(
                manageFlowTemplateContextSchema.strip().parse(input),
            );
        },
    }),
    operation({
        op: 'list_repairs',
        input: { ...manageFlowListRepairsSchema.partial().shape, flowId: MANAGE_FLOW_SHARED_FIELDS.flowId },
        access: 'read',
        describe: { order: 16, text: 'list_repairs: Read suggested flow repairs. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowListRepairs(manageFlowListRepairsSchema.strip().parse(input));
        },
    }),
    operation({
        op: 'update_action',
        input: { ...manageFlowUpdateActionSchema.partial().shape, actionId: MANAGE_FLOW_SHARED_FIELDS.actionId, name: MANAGE_FLOW_SHARED_FIELDS.name },
        access: 'write',
        describe: { order: 17, text: 'update_action: Update a workflow action. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowUpdateAction(manageFlowUpdateActionSchema.strip().parse(input));
        },
    }),
    operation({
        op: 'delete_action',
        input: { ...manageFlowDeleteActionSchema.partial().shape, actionId: MANAGE_FLOW_SHARED_FIELDS.actionId },
        access: 'write',
        describe: { order: 18, text: 'delete_action: Delete a workflow action. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowDeleteAction(manageFlowDeleteActionSchema.strip().parse(input));
        },
    }),
    operation({
        op: 'update_trigger',
        input: { ...manageFlowUpdateTriggerSchema.partial().shape, triggerId: MANAGE_FLOW_SHARED_FIELDS.triggerId, name: MANAGE_FLOW_SHARED_FIELDS.name },
        access: 'write',
        describe: { order: 19, text: 'update_trigger: Update a workflow trigger. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowUpdateTrigger(manageFlowUpdateTriggerSchema.strip().parse(input));
        },
    }),
    operation({
        op: 'delete_trigger',
        input: { ...manageFlowDeleteTriggerSchema.partial().shape, triggerId: MANAGE_FLOW_SHARED_FIELDS.triggerId },
        access: 'write',
        describe: { order: 20, text: 'delete_trigger: Delete a workflow trigger. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowDeleteTrigger(manageFlowDeleteTriggerSchema.strip().parse(input));
        },
    }),
    operation({
        op: 'fire_trigger',
        input: { ...manageFlowFireTriggerSchema.partial().shape, triggerId: MANAGE_FLOW_SHARED_FIELDS.triggerId },
        access: 'commerce',
        describe: { order: 21, text: 'fire_trigger: Fire a workflow trigger. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowFireTrigger(manageFlowFireTriggerSchema.strip().parse(input));
        },
    }),
    operation({
        op: 'abort_execution',
        input: { ...manageFlowAbortExecutionSchema.partial().shape },
        access: 'write',
        describe: { order: 22, text: 'abort_execution: Abort a running execution. ' },
        run: async (ctx, input) => {
            return ctx.backend.workflows.manageFlowAbortExecution(manageFlowAbortExecutionSchema.strip().parse(input));
        },
    }),
] as const;
const MANAGE_FLOW_OPERATIONS = operationValues(MANAGE_FLOW_TABLE);

export function registerManageFlowTool(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(MANAGE_FLOW_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_flow'));
    server.registerTool(
        'manage_flow',
        {
            description:
                operationDescription(MANAGE_FLOW_TABLE) + allowedValuesNote(operationValues, MANAGE_FLOW_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_FLOW_OPERATIONS),
                ...operationInput(MANAGE_FLOW_TABLE, MANAGE_FLOW_SHARED_FIELDS),
            },
        },
        async (input) => asTextResult(await runOperation(MANAGE_FLOW_TABLE, input.operation, ctx, input)),
    );
}
