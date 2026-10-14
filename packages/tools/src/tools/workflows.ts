import { type Operation, operationValues, operationInput, selectInput, operationDescription, runOperation, operationFields } from './operation-table.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { disallowedFilterError } from './op-helpers.js';
// Workflow tools expose the public action catalog without step-type filtering.
// Flows are returned as-is, without binding them to a chat session.
// Service filters match the public SDK; resource errors include resource/id context.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BackendError } from '../backend/errors.js';
import { scheduleRuleSchema } from '../backend/workflows.js';
import type { ToolCtx } from '../ctx.js';
import { asErrorResult, asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const serviceFilter = z.enum(['tasks_api', 'devices_api', 'agents_api', 'webhooks', 'integrations_api']);
const LIST_WORKFLOW_RESOURCES_INPUT_FIELDS = { service: serviceFilter.optional(),
    search: z.string().optional().describe('Substring match on name.'),
    activation: z.enum(['event', 'schedule', 'custom']).optional(),
    eventType: z.string().optional(),
    enabled: z.boolean().optional(),
    triggerId: z.string().optional(),
    flowId: z.string().optional(),
    status: z.enum(['pending', 'running', 'success', 'failed']).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(100).optional(),
    limit: z.number().int().positive().max(100).optional() };
type LIST_WORKFLOW_RESOURCES_INPUT = z.infer<z.ZodObject<typeof LIST_WORKFLOW_RESOURCES_INPUT_FIELDS>> & {
    resource: string;
};
export const LIST_WORKFLOW_RESOURCES_TABLE = [
    { op: "action_catalog", input: selectInput(LIST_WORKFLOW_RESOURCES_INPUT_FIELDS, ['service']), readonly: true, billed: false, describe: { "order": 0, "text": "List one kind of workflow resource, chosen via `resource`. Each resource accepts only its own filter subset — a filter only valid for a DIFFERENT resource is rejected naming what is allowed here. `resource` values:\n- action_catalog (filters: " }, required: [], run: async (ctx, input) => {
            const { resource, ...filters } = input;
            return asTextResult(await ctx.backend.workflows.listActionCatalog({ service: filters.service }));
        } },
    { op: "action", input: selectInput(LIST_WORKFLOW_RESOURCES_INPUT_FIELDS, ['service', 'search', 'page', 'pageSize']), readonly: true, billed: false, describe: { "order": 2, "text": "action (filters: service, search, page, pageSize): the user's saved actions (configured catalog instances) — slim overview; call get_workflow_resource(resource=\"action\") for full params.\n- " }, required: [], run: async (ctx, input) => {
            const { resource, ...filters } = input;
            return asTextResult(await ctx.backend.workflows.listActions({
                service: filters.service,
                search: filters.search,
                page: filters.page,
                pageSize: filters.pageSize,
            }));
        } },
    { op: "trigger", input: selectInput(LIST_WORKFLOW_RESOURCES_INPUT_FIELDS, ['activation', 'eventType', 'search', 'page', 'pageSize']), readonly: true, billed: false, describe: { "order": 3, "text": "trigger (filters: activation, eventType, search, page, pageSize): the user's triggers.\n- " }, required: [], run: async (ctx, input) => {
            const { resource, ...filters } = input;
            return asTextResult(await ctx.backend.workflows.listTriggers({
                activation: filters.activation,
                eventType: filters.eventType,
                search: filters.search,
                page: filters.page,
                pageSize: filters.pageSize,
            }));
        } },
    { op: "flow", input: selectInput(LIST_WORKFLOW_RESOURCES_INPUT_FIELDS, ['enabled', 'search', 'triggerId', 'page', 'pageSize']), readonly: true, billed: false, describe: { "order": 4, "text": "flow (filters: enabled, search, triggerId, page, pageSize): the user's automation flows.\n- " }, required: [], run: async (ctx, input) => {
            const { resource, ...filters } = input;
            return asTextResult(await ctx.backend.workflows.listFlows({
                enabled: filters.enabled,
                search: filters.search,
                triggerId: filters.triggerId,
                page: filters.page,
                pageSize: filters.pageSize,
            }));
        } },
    { op: "execution", input: selectInput(LIST_WORKFLOW_RESOURCES_INPUT_FIELDS, ['flowId', 'triggerId', 'status', 'limit']), readonly: true, billed: false, describe: { "order": 5, "text": "execution (filters: flowId, triggerId, status, limit): flow executions.\n- service (no filters): the workflow-action service identifiers (e.g. tasks_api, devices_api) usable as the `service` filter elsewhere in this tool.\n- " }, required: [], run: async (ctx, input) => {
            const { resource, ...filters } = input;
            return asTextResult(await ctx.backend.workflows.listExecutions({
                flowId: filters.flowId,
                triggerId: filters.triggerId,
                status: filters.status,
                limit: filters.limit,
            }));
        } },
    { op: "service", input: selectInput(LIST_WORKFLOW_RESOURCES_INPUT_FIELDS, []), readonly: true, billed: false, describe: { "order": 1, "text": "service): every available workflow step.\n- " }, required: [], run: async (ctx, input) => { return asTextResult(await ctx.backend.workflows.listServices()); } },
    { op: "service_methods", input: selectInput(LIST_WORKFLOW_RESOURCES_INPUT_FIELDS, ['service']), readonly: true, billed: false, describe: { "order": 6, "text": "service_methods (filter REQUIRED: service): the methods a given service supports, each with its param schema — background info on what an action_catalog entry for that service can do." }, required: ['service'], run: async (ctx, input) => {
            const { resource, ...filters } = input;
            return asTextResult(await ctx.backend.workflows.listServiceMethods(filters.service as string));
        } },
] as const satisfies readonly Operation<LIST_WORKFLOW_RESOURCES_INPUT, CallToolResult>[];
const GET_WORKFLOW_RESOURCE_INPUT_FIELDS = { id: z.string() };
type GET_WORKFLOW_RESOURCE_INPUT = z.infer<z.ZodObject<typeof GET_WORKFLOW_RESOURCE_INPUT_FIELDS>> & {
    resource: string;
};
export const GET_WORKFLOW_RESOURCE_TABLE = [
    { op: "action_catalog", input: selectInput(GET_WORKFLOW_RESOURCE_INPUT_FIELDS, ["id"]), readonly: true, billed: false, describe: { "order": 0, "text": "Fetch one workflow resource by id, chosen via `resource` (action_catalog | " }, run: async (ctx, input) => {
            const { id } = input;
            return asTextResult(await ctx.backend.workflows.getActionCatalogEntry(id));
        } },
    { op: "action", input: selectInput(GET_WORKFLOW_RESOURCE_INPUT_FIELDS, ["id"]), readonly: true, billed: false, describe: { "order": 1, "text": "action | " }, run: async (ctx, input) => {
            const { id } = input;
            return asTextResult(await ctx.backend.workflows.getAction(id));
        } },
    { op: "trigger", input: selectInput(GET_WORKFLOW_RESOURCE_INPUT_FIELDS, ["id"]), readonly: true, billed: false, describe: { "order": 2, "text": "trigger | " }, run: async (ctx, input) => {
            const { id } = input;
            return asTextResult(await ctx.backend.workflows.getTrigger(id));
        } },
    { op: "flow", input: selectInput(GET_WORKFLOW_RESOURCE_INPUT_FIELDS, ["id"]), readonly: true, billed: false, describe: { "order": 3, "text": "flow | " }, run: async (ctx, input) => {
            const { id } = input;
            return asTextResult(await ctx.backend.workflows.getFlow(id));
        } },
    { op: "execution", input: selectInput(GET_WORKFLOW_RESOURCE_INPUT_FIELDS, ["id"]), readonly: true, billed: false, describe: { "order": 4, "text": "execution). Returns full config/params, unlike the slim list projections." }, run: async (ctx, input) => {
            const { id } = input;
            return asTextResult(await ctx.backend.workflows.getExecution(id));
        } },
] as const satisfies readonly Operation<GET_WORKFLOW_RESOURCE_INPUT, CallToolResult>[];
const LIST_RESOURCES = operationValues(LIST_WORKFLOW_RESOURCES_TABLE);
type ListResource = (typeof LIST_RESOURCES)[number];
const GET_RESOURCES = operationValues(GET_WORKFLOW_RESOURCE_TABLE);
type GetResource = (typeof GET_RESOURCES)[number];
type ListFilters = {
    service?: 'tasks_api' | 'devices_api' | 'agents_api' | 'webhooks' | 'integrations_api';
    search?: string;
    activation?: 'event' | 'schedule' | 'custom';
    eventType?: string;
    enabled?: boolean;
    triggerId?: string;
    flowId?: string;
    status?: 'pending' | 'running' | 'success' | 'failed';
    page?: number;
    pageSize?: number;
    limit?: number;
};
// A filter key outside a resource's allowed set is rejected rather than silently ignored.
const ALLOWED_FILTERS = operationFields(LIST_WORKFLOW_RESOURCES_TABLE);
// Unlike ALLOWED_FILTERS (which rejects an extra filter), this marks a
// filter as REQUIRED for a resource — service_methods has no meaning
// without a target service.
const REQUIRED_FILTERS = Object.fromEntries(LIST_WORKFLOW_RESOURCES_TABLE.map(({ op, required }) => [op, required]));
const FILTER_KEYS: readonly (keyof ListFilters)[] = [
    'service',
    'search',
    'activation',
    'eventType',
    'enabled',
    'triggerId',
    'flowId',
    'status',
    'page',
    'pageSize',
    'limit',
];
const flowActionBindingSchema = z
    .object({
    actionId: z.string(),
    position: z.number().int().min(0),
    key: z
        .string()
        .optional()
        .describe("Stable per-step id (^[a-z_][a-z0-9_-]{0,63}$), used to reference this step's output from later " +
        'steps. Derived from the action if omitted.'),
})
    .strict();
const flowDeviceIdsSchema = z
    .array(z.string())
    .min(1)
    .describe('Owned device ids on which device-bound steps may run. Required for a runnable device workflow.');
export function registerWorkflowTools(server: McpServer, ctx: ToolCtx): void {
    const listResourceValues = narrowedValues(LIST_RESOURCES, ctx.policy.operationAllowlist?.get('list_workflow_resources'));
    const getResourceValues = narrowedValues(GET_RESOURCES, ctx.policy.operationAllowlist?.get('get_workflow_resource'));
    server.registerTool('list_workflow_resources', {
        description: operationDescription(LIST_WORKFLOW_RESOURCES_TABLE) + allowedValuesNote(listResourceValues, LIST_RESOURCES),
        inputSchema: { resource: z.enum(LIST_RESOURCES), ...operationInput(LIST_WORKFLOW_RESOURCES_TABLE, LIST_WORKFLOW_RESOURCES_INPUT_FIELDS) },
    }, async ({ resource, ...filters }: {
        resource: ListResource;
    } & ListFilters) => {
        const filterError = disallowedFilterError(resource, ALLOWED_FILTERS[resource], FILTER_KEYS, REQUIRED_FILTERS[resource], filters);
        if (filterError)
            return asErrorResult(filterError);
        return runOperation(LIST_WORKFLOW_RESOURCES_TABLE, resource, ctx, { resource, ...filters });
    });
    server.registerTool('get_workflow_resource', {
        description: operationDescription(GET_WORKFLOW_RESOURCE_TABLE) + allowedValuesNote(getResourceValues, GET_RESOURCES),
        inputSchema: { resource: z.enum(GET_RESOURCES), ...operationInput(GET_WORKFLOW_RESOURCE_TABLE, GET_WORKFLOW_RESOURCE_INPUT_FIELDS) },
    }, async ({ resource, id }: {
        resource: GetResource;
        id: string;
    }) => {
        try {
            return await runOperation(GET_WORKFLOW_RESOURCE_TABLE, resource, ctx, { resource, id });
        }
        catch (err) {
            // Codex fix pack (2026-08-12): a BackendError MUST stay a
            // BackendError through this context-wrapping rethrow —
            // register.ts's enforcePolicy only renders the typed
            // `[code] message` shape (asErrorResult) for
            // `err instanceof BackendError`; wrapping it in a plain
            // `Error` here (the previous bug) lost the not_found/
            // forbidden/etc code before the client ever saw it.
            const msg = err instanceof Error ? err.message : String(err);
            if (err instanceof BackendError) {
                throw new BackendError(err.code, `${resource} ${id}: ${msg}`, err.status);
            }
            throw new Error(`${resource} ${id}: ${msg}`);
        }
    });
    server.registerTool('create_action', {
        description: 'Create an action from a catalog entry. `params` is action-specific (shape per the entry paramsSchema).',
        inputSchema: {
            catalogEntryId: z.string(),
            name: z.string(),
            description: z.string().optional(),
            isAsync: z.boolean().optional(),
            params: z.record(z.string(), z.unknown()).optional(),
        },
    }, async (params) => asTextResult(await ctx.backend.workflows.createAction(params)));
    server.registerTool('create_trigger', {
        description: 'Create a trigger. activation=event needs eventType; =schedule needs scheduleRule (type once|cron|recurring) + timezone for cron/recurring; =custom optionally constrained by customPayloadSchema. (Cron is a scheduleRule.type, not an activation.) scheduleRule optionally carries `jitter` ({ beforeMinutes?, afterMinutes? }, each 0-1440) to randomize the fire time within a window around the nominal schedule.',
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
    }, async (params) => asTextResult(await ctx.backend.workflows.createTrigger(params)));
    server.registerTool('create_flow', {
        description: 'Create a flow binding a trigger to ordered actions. Put target devices in the top-level `deviceIds` array. Each action entry is { actionId, position (integer >= 0; defines order), optional key }; action-level deviceId is not supported. ' +
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
    }, async (params) => asTextResult(await ctx.backend.workflows.createFlow(params)));
}
