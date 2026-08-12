// Workflows bundle tools. Design notes:
//   - No hidden step-type filtering: a chat-harness-style curated catalog
//     that hides internal step types (e.g. file/upload steps) is a
//     different, host-specific concern. The public @mobilerun/sdk action
//     catalog is already a public-facing surface — nothing to filter out here.
//   - No active-session binding: chat-session concepts like an
//     auto-bound "current conversation" don't exist in this auth-agnostic
//     ToolCtx. create_flow returns the flow as-is.
//   - `service` filter enum is @mobilerun/sdk's actual union — verified
//     against the SDK's shipped action-catalog.d.ts / actions/actions.d.ts.
//   - get_workflow_resource / list_workflow_resources wrap backend errors
//     with `${resource} ${id}: ${msg}` context; there is no special-cased
//     rethrow for internal step-surface errors (nothing produces one here).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BackendError } from '../backend/errors.js';
import type { ToolCtx } from '../ctx.js';
import { asErrorResult, asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

const LIST_RESOURCES = [
    'action_catalog',
    'app_event_catalog',
    'action',
    'trigger',
    'flow',
    'execution',
    'service',
    'service_methods',
] as const;
type ListResource = (typeof LIST_RESOURCES)[number];

const GET_RESOURCES = ['action_catalog', 'action', 'trigger', 'flow', 'execution'] as const;
type GetResource = (typeof GET_RESOURCES)[number];

type ListFilters = {
    service?: 'tasks_api' | 'devices_api' | 'agents_api' | 'webhooks';
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
const ALLOWED_FILTERS: Record<ListResource, readonly (keyof ListFilters)[]> = {
    action_catalog: ['service'],
    app_event_catalog: [],
    action: ['service', 'search', 'page', 'pageSize'],
    trigger: ['activation', 'eventType', 'search', 'page', 'pageSize'],
    flow: ['enabled', 'search', 'triggerId', 'page', 'pageSize'],
    execution: ['flowId', 'triggerId', 'status', 'limit'],
    service: [],
    service_methods: ['service'],
};

// Unlike ALLOWED_FILTERS (which rejects an extra filter), this marks a
// filter as REQUIRED for a resource — service_methods has no meaning
// without a target service.
const REQUIRED_FILTERS: Partial<Record<ListResource, readonly (keyof ListFilters)[]>> = {
    service_methods: ['service'],
};

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

function disallowedFilterError(resource: ListResource, filters: ListFilters): string | null {
    const allowed = ALLOWED_FILTERS[resource];
    const extra = FILTER_KEYS.filter((k) => filters[k] !== undefined && !allowed.includes(k));
    if (extra.length > 0) {
        return `filter ${extra.join(', ')} is not valid for resource=${resource}; allowed filters: ${allowed.join(', ') || '(none)'}`;
    }
    const required = REQUIRED_FILTERS[resource];
    const missing = required?.filter((k) => filters[k] === undefined) ?? [];
    if (missing.length > 0) {
        return `resource=${resource} requires filter: ${missing.join(', ')}`;
    }
    return null;
}

const scheduleRuleSchema = z.object({
    type: z.enum(['once', 'cron', 'recurring']),
    dateTime: z.string().optional().describe('Required when type=once. ISO 8601.'),
    expression: z.string().optional().describe('Required when type=cron. 5-field cron.'),
    rrule: z.string().optional().describe('Required when type=recurring. RRULE string.'),
    jitter: z
        .object({
            beforeMinutes: z.number().int().min(0).max(1440).optional(),
            afterMinutes: z.number().int().min(0).max(1440).optional(),
        })
        .optional()
        .describe(
            'Random execution window in minutes around the nominal time (0-1440 each). Each occurrence gets a stable random offset within it.',
        ),
});

const flowActionBindingSchema = z
    .object({
        actionId: z.string(),
        position: z.number().int().positive(),
    })
    .strict();

const flowDeviceIdsSchema = z
    .array(z.string())
    .min(1)
    .describe('Owned device ids on which device-bound steps may run. Required for a runnable device workflow.');

export function registerWorkflowTools(server: McpServer, ctx: ToolCtx): void {
    const serviceFilter = z.enum(['tasks_api', 'devices_api', 'agents_api', 'webhooks']);

    const listResourceValues = narrowedValues(LIST_RESOURCES, ctx.policy.operationAllowlist?.get('list_workflow_resources'));
    const getResourceValues = narrowedValues(GET_RESOURCES, ctx.policy.operationAllowlist?.get('get_workflow_resource'));

    server.registerTool(
        'list_workflow_resources',
        {
            description:
                'List one kind of workflow resource, chosen via `resource`. Each resource accepts only its ' +
                'own filter subset — a filter only valid for a DIFFERENT resource is rejected naming what is ' +
                'allowed here. `resource` values:\n' +
                '- action_catalog (filters: service): the full reviewed workflow step surface.\n' +
                '- app_event_catalog (no filters): every selectable app event and device event, each with its ' +
                'app, source event and payload fields. Call this BEFORE create_trigger with activation ' +
                '"event" — never guess an app.*/system.* type.\n' +
                "- action (filters: service, search, page, pageSize): the user's saved actions (configured " +
                'catalog instances) — slim overview; call get_workflow_resource(resource="action") for full params.\n' +
                "- trigger (filters: activation, eventType, search, page, pageSize): the user's triggers.\n" +
                "- flow (filters: enabled, search, triggerId, page, pageSize): the user's automation flows.\n" +
                '- execution (filters: flowId, triggerId, status, limit): flow executions.\n' +
                '- service (no filters): the workflow-action service identifiers (e.g. tasks_api, devices_api) ' +
                "usable as the `service` filter elsewhere in this tool.\n" +
                '- service_methods (filter REQUIRED: service): the methods a given service supports, each with ' +
                'its param schema — background info on what an action_catalog entry for that service can do.' +
                allowedValuesNote(listResourceValues, LIST_RESOURCES),
            inputSchema: {
                // Enum intentionally stays the FULL set: narrowing it to the
                // policy's allowed subset would make an out-of-policy value
                // fail zod input validation before register.ts's dispatch-time
                // operation gate ever runs, which is where the actual
                // enforcement (and its audit event) lives. The description
                // above documents the allowed subset instead.
                resource: z.enum(LIST_RESOURCES),
                service: serviceFilter.optional(),
                search: z.string().optional().describe('Substring match on name.'),
                activation: z.enum(['event', 'schedule', 'custom']).optional(),
                eventType: z.string().optional(),
                enabled: z.boolean().optional(),
                triggerId: z.string().optional(),
                flowId: z.string().optional(),
                status: z.enum(['pending', 'running', 'success', 'failed']).optional(),
                page: z.number().int().positive().optional(),
                pageSize: z.number().int().positive().max(100).optional(),
                limit: z.number().int().positive().max(100).optional(),
            },
        },
        async ({ resource, ...filters }: { resource: ListResource } & ListFilters) => {
            const filterError = disallowedFilterError(resource, filters);
            if (filterError) return asErrorResult(filterError);

            switch (resource) {
                case 'action_catalog':
                    return asTextResult(await ctx.backend.workflows.listActionCatalog({ service: filters.service }));
                case 'app_event_catalog':
                    return asTextResult(await ctx.backend.workflows.listAppEventCatalog());
                case 'action':
                    return asTextResult(
                        await ctx.backend.workflows.listActions({
                            service: filters.service,
                            search: filters.search,
                            page: filters.page,
                            pageSize: filters.pageSize,
                        }),
                    );
                case 'trigger':
                    return asTextResult(
                        await ctx.backend.workflows.listTriggers({
                            activation: filters.activation,
                            eventType: filters.eventType,
                            search: filters.search,
                            page: filters.page,
                            pageSize: filters.pageSize,
                        }),
                    );
                case 'flow':
                    return asTextResult(
                        await ctx.backend.workflows.listFlows({
                            enabled: filters.enabled,
                            search: filters.search,
                            triggerId: filters.triggerId,
                            page: filters.page,
                            pageSize: filters.pageSize,
                        }),
                    );
                case 'execution':
                    return asTextResult(
                        await ctx.backend.workflows.listExecutions({
                            flowId: filters.flowId,
                            triggerId: filters.triggerId,
                            status: filters.status,
                            limit: filters.limit,
                        }),
                    );
                case 'service':
                    return asTextResult(await ctx.backend.workflows.listServices());
                case 'service_methods':
                    // filters.service presence already enforced by REQUIRED_FILTERS above.
                    return asTextResult(await ctx.backend.workflows.listServiceMethods(filters.service as string));
            }
        },
    );

    server.registerTool(
        'get_workflow_resource',
        {
            description:
                'Fetch one workflow resource by id, chosen via `resource` (action_catalog | action | trigger ' +
                '| flow | execution — app_event_catalog has no get, only list). Returns full config/params, ' +
                'unlike the slim list projections.' +
                allowedValuesNote(getResourceValues, GET_RESOURCES),
            inputSchema: {
                // See list_workflow_resources above for why this enum stays full.
                resource: z.enum(GET_RESOURCES),
                id: z.string(),
            },
        },
        async ({ resource, id }: { resource: GetResource; id: string }) => {
            try {
                switch (resource) {
                    case 'action_catalog':
                        return asTextResult(await ctx.backend.workflows.getActionCatalogEntry(id));
                    case 'action':
                        return asTextResult(await ctx.backend.workflows.getAction(id));
                    case 'trigger':
                        return asTextResult(await ctx.backend.workflows.getTrigger(id));
                    case 'flow':
                        return asTextResult(await ctx.backend.workflows.getFlow(id));
                    case 'execution':
                        return asTextResult(await ctx.backend.workflows.getExecution(id));
                }
            } catch (err) {
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
        },
    );

    server.registerTool(
        'create_action',
        {
            description:
                'Create an action from a catalog entry. `params` is action-specific (shape per the entry paramsSchema).',
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
                'Create a flow binding a trigger to ordered actions. Put target devices in the top-level `deviceIds` array. Each action entry is only { actionId, position (1-based) }; action-level deviceId is not supported.',
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
