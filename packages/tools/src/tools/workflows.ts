import { disallowedFilterError, operation, operationFields, registerBundle, sdkOp } from './operation-table.js';
// Workflow tools expose the public action catalog without step-type filtering.
// Flows are returned as-is, without binding them to a chat session.
// Service filters match the public SDK; resource errors include resource/id context.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BackendError } from '../backend/errors.js';
import { scheduleRuleSchema } from '../backend/workflows.js';
import type { ToolCtx } from '../ctx.js';
import { asErrorResult, asTextResult } from '../text-result.js';
const serviceFilter = z.enum(['tasks_api', 'devices_api', 'agents_api', 'webhooks', 'integrations_api']);
const LIST_WORKFLOW_RESOURCES_SHARED_FIELDS = {
    service: serviceFilter.optional(),
    search: z.string().optional().describe('Substring match on name.'),
    triggerId: z.string().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(100).optional(),
};

const LIST_WORKFLOW_RESOURCES_INTRO =
    'List one kind of workflow resource, chosen via resource. Each resource accepts only its own filter subset; a filter for a different resource is rejected with the allowed filters.';
export const LIST_WORKFLOW_RESOURCES_TABLE = [
    operation({
        op: 'action_catalog',
        input: { service: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.service },
        access: 'read',
        doc: 'Read every available workflow step (filter: service).',
        run: async (ctx, input) => asTextResult(await ctx.backend.workflows.listActionCatalog({ service: input.service })),
    }),
    operation({
        op: 'action',
        input: {
            service: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.service,
            search: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.search,
            page: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.page,
            pageSize: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.pageSize,
        },
        access: 'read',
        doc: 'List saved actions, configured catalog instances (filters: service, search, page, pageSize). Slim overview; use get_workflow_resource(resource="action") for full params.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.workflows.listActions({
                    service: input.service,
                    search: input.search,
                    page: input.page,
                    pageSize: input.pageSize,
                }),
            ),
    }),
    operation({
        op: 'trigger',
        input: {
            activation: z.enum(['event', 'schedule', 'custom']).optional(),
            eventType: z.string().optional(),
            search: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.search,
            page: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.page,
            pageSize: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.pageSize,
        },
        access: 'read',
        doc: 'List triggers (filters: activation, eventType, search, page, pageSize).',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.workflows.listTriggers({
                    activation: input.activation,
                    eventType: input.eventType,
                    search: input.search,
                    page: input.page,
                    pageSize: input.pageSize,
                }),
            ),
    }),
    operation({
        op: 'flow',
        input: {
            enabled: z.boolean().optional(),
            search: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.search,
            triggerId: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.triggerId,
            page: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.page,
            pageSize: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.pageSize,
        },
        access: 'read',
        doc: 'List automation flows (filters: enabled, search, triggerId, page, pageSize).',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.workflows.listFlows({
                    enabled: input.enabled,
                    search: input.search,
                    triggerId: input.triggerId,
                    page: input.page,
                    pageSize: input.pageSize,
                }),
            ),
    }),
    operation({
        op: 'execution',
        input: {
            flowId: z.string().optional(),
            triggerId: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.triggerId,
            status: z.enum(['pending', 'running', 'success', 'failed']).optional(),
            limit: z.number().int().positive().max(100).optional(),
        },
        access: 'read',
        doc: 'List flow executions (filters: flowId, triggerId, status, limit).',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.workflows.listExecutions({
                    flowId: input.flowId,
                    triggerId: input.triggerId,
                    status: input.status,
                    limit: input.limit,
                }),
            ),
    }),
    sdkOp('service', z.object({}), (ctx) => ctx.backend.workflows.listServices(), 'read', {
        doc: 'List workflow-action service identifiers, e.g. tasks_api or devices_api, usable as the service filter elsewhere in this tool.',
    }),
    operation({
        op: 'service_methods',
        input: { service: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS.service },
        access: 'read',
        doc: 'Read supported methods and their parameter schemas for a service (REQUIRED filter: service); background info on what an action_catalog entry for that service can do.',
        run: async (ctx, input) => {
            if (input.service === undefined) return asErrorResult('resource=service_methods requires filter: service');
            const filters = input;
            return asTextResult(await ctx.backend.workflows.listServiceMethods(filters.service as string));
        },
    }),
] as const;
const GET_WORKFLOW_RESOURCE_SHARED_FIELDS = {
    id: z.string(),
};

const GET_WORKFLOW_RESOURCE_INTRO =
    'Fetch one workflow resource by id, chosen via resource. Returns full config/params, unlike the slim list projections.';
export const GET_WORKFLOW_RESOURCE_TABLE = [
    operation({
        op: 'action_catalog',
        input: { id: GET_WORKFLOW_RESOURCE_SHARED_FIELDS.id },
        access: 'read',
        doc: 'Read one action catalog by id.',
        run: async (ctx, input) => asTextResult(await ctx.backend.workflows.getActionCatalogEntry(input.id)),
    }),
    operation({
        op: 'action',
        input: { id: GET_WORKFLOW_RESOURCE_SHARED_FIELDS.id },
        access: 'read',
        doc: 'Read one action by id.',
        run: async (ctx, input) => asTextResult(await ctx.backend.workflows.getAction(input.id)),
    }),
    operation({
        op: 'trigger',
        input: { id: GET_WORKFLOW_RESOURCE_SHARED_FIELDS.id },
        access: 'read',
        doc: 'Read one trigger by id.',
        run: async (ctx, input) => asTextResult(await ctx.backend.workflows.getTrigger(input.id)),
    }),
    operation({
        op: 'flow',
        input: { id: GET_WORKFLOW_RESOURCE_SHARED_FIELDS.id },
        access: 'read',
        doc: 'Read one flow by id.',
        run: async (ctx, input) => asTextResult(await ctx.backend.workflows.getFlow(input.id)),
    }),
    operation({
        op: 'execution',
        input: { id: GET_WORKFLOW_RESOURCE_SHARED_FIELDS.id },
        access: 'read',
        doc: 'Read one execution by id.',
        run: async (ctx, input) => asTextResult(await ctx.backend.workflows.getExecution(input.id)),
    }),
] as const;

type ListResource = (typeof LIST_WORKFLOW_RESOURCES_TABLE)[number]['op'];

// A filter key outside a resource's allowed set is rejected rather than silently ignored.
const { byOperation: ALLOWED_FILTERS, keys: FILTER_KEYS } = operationFields(LIST_WORKFLOW_RESOURCES_TABLE);
const flowActionBindingSchema = z
    .object({
        actionId: z.string(),
        position: z.number().int().min(0),
        key: z
            .string()
            .optional()
            .describe(
                "Stable per-step id (^[a-z_][a-z0-9_-]{0,63}$), used to reference this step's output from later " +
                    'steps. Derived from the action if omitted.',
            ),
    })
    .strict();
const flowDeviceIdsSchema = z
    .array(z.string())
    .min(1)
    .describe('Owned device ids on which device-bound steps may run. Required for a runnable device workflow.');
export function registerWorkflowTools(server: McpServer, ctx: ToolCtx): void {
    registerBundle(server, ctx, 'list_workflow_resources', LIST_WORKFLOW_RESOURCES_TABLE, {
        intro: LIST_WORKFLOW_RESOURCES_INTRO,
        shared: LIST_WORKFLOW_RESOURCES_SHARED_FIELDS,
        field: 'resource',
        beforeRun: (input) =>
            disallowedFilterError(input.resource as string, ALLOWED_FILTERS[input.resource as ListResource], FILTER_KEYS, input),
    });
    registerBundle(server, ctx, 'get_workflow_resource', GET_WORKFLOW_RESOURCE_TABLE, {
        intro: GET_WORKFLOW_RESOURCE_INTRO,
        shared: GET_WORKFLOW_RESOURCE_SHARED_FIELDS,
        field: 'resource',
        onError: (error, input) => {
            const msg = error instanceof Error ? error.message : String(error);
            if (error instanceof BackendError) throw new BackendError(error.code, `${input.resource} ${input.id}: ${msg}`, error.status);
            throw new Error(`${input.resource} ${input.id}: ${msg}`);
        },
    });
    server.registerTool(
        'create_action',
        {
            description: 'Create an action from a catalog entry. `params` is action-specific (shape per the entry paramsSchema).',
            inputSchema: {
                catalogEntryId: z.string(),
                name: z.string(),
                description: z.string().optional(),
                isAsync: z.boolean().optional(),
                params: z.record(z.string(), z.unknown()).optional(),
            },
        },
        async (params) => asTextResult(await ctx.backend.workflows.createAction(params)),
    );
    server.registerTool(
        'create_trigger',
        {
            description:
                'Create a trigger. activation=event needs eventType; =schedule needs scheduleRule (type once|cron|recurring) + timezone for cron/recurring; =custom optionally constrained by customPayloadSchema. (Cron is a scheduleRule.type, not an activation.) scheduleRule optionally carries `jitter` ({ beforeMinutes?, afterMinutes? }, each 0-1440) to randomize the fire time within a window around the nominal schedule.',
            inputSchema: {
                name: z.string(),
                activation: z.enum(['event', 'schedule', 'custom']),
                eventType: z.string().optional().describe('Required when activation=event.'),
                scheduleRule: scheduleRuleSchema.optional(),
                customPayloadSchema: z.record(z.string(), z.unknown()).optional(),
                timezone: z.string().optional().describe('IANA, required for cron/recurring.'),
                description: z.string().optional(),
                conditions: z
                    .object({
                        all: z.array(z.unknown()).optional(),
                        any: z.array(z.unknown()).optional(),
                    })
                    .optional(),
            },
        },
        async (params) => asTextResult(await ctx.backend.workflows.createTrigger(params)),
    );
    server.registerTool(
        'create_flow',
        {
            description:
                'Create a flow binding a trigger to ordered actions. Put target devices in the top-level `deviceIds` array. Each action entry is { actionId, position (integer >= 0; defines order), optional key }; action-level deviceId is not supported. ' +
                'The created flow uses template resolution version 3: reference an earlier step\'s output in a later action\'s params as {{steps.<key>.body.<field>}}, and the triggering event as {{event.payload.*}} (check templateResolutionVersion via get_workflow_resource(resource="flow") on older flows).',
            inputSchema: {
                name: z.string(),
                triggerId: z.string(),
                actions: z.array(flowActionBindingSchema),
                deviceIds: flowDeviceIdsSchema,
                description: z.string().optional(),
                cooldownSeconds: z.number().int().nonnegative().optional(),
                cooldownScope: z.enum(['flow', 'device']).optional(),
            },
        },
        async (params) => asTextResult(await ctx.backend.workflows.createFlow(params)),
    );
}
