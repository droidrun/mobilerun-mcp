import type Mobilerun from '@mobilerun/sdk';
import type {
    AddFlowActionParams,
    CloneFlowParams,
    CreateActionParams,
    CreateFlowParams,
    CreateTriggerParams,
    DryRunEventParams,
    ExecutionMetricsOpts,
    IngestEventParams,
    ListActionCatalogOpts,
    ListActionsOpts,
    ListAppEventCatalogOpts,
    ListExecutionsOpts,
    ListFlowsOpts,
    ListTriggersOpts,
    RegisterEventTypesParams,
    RemoveFlowActionParams,
    ReplaceFlowActionsParams,
    WorkflowService,
    WorkflowsBackend,
} from '@mobilerun/mcp-tools';

export function createWorkflowsBackend(client: Mobilerun): WorkflowsBackend {
    return {
        async listActionCatalog(opts: ListActionCatalogOpts) {
            // pageSize 100: the whole reviewed action catalog is expected to
            // fit in one page.
            return client.workflows.actionCatalog.list({ service: opts.service, pageSize: 100 });
        },
        async getActionCatalogEntry(id: string) {
            return client.workflows.actionCatalog.retrieve(id);
        },
        async listAppEventCatalog(opts: ListAppEventCatalogOpts = {}) {
            return client.workflows.events.catalog.list({ source: opts.source, page: opts.page, pageSize: opts.pageSize });
        },
        async listActions(opts: ListActionsOpts) {
            return client.workflows.actions.list({
                service: opts.service,
                search: opts.search,
                page: opts.page,
                pageSize: opts.pageSize,
            });
        },
        async getAction(id: string) {
            return client.workflows.actions.retrieve(id);
        },
        async createAction(params: CreateActionParams) {
            // GAP: @mobilerun/sdk's ActionCreateParams has no `isAsync` field
            // (verified against workflows/actions/actions.d.ts) — the public SDK
            // simply doesn't expose it. Dropped rather than sent unchecked.
            return client.workflows.actions.create({
                catalogEntryId: params.catalogEntryId,
                name: params.name,
                description: params.description,
                params: params.params,
            });
        },
        async listTriggers(opts: ListTriggersOpts) {
            return client.workflows.triggers.list({
                activation: opts.activation,
                eventType: opts.eventType,
                search: opts.search,
                page: opts.page,
                pageSize: opts.pageSize,
            });
        },
        async getTrigger(id: string) {
            return client.workflows.triggers.retrieve(id);
        },
        async createTrigger(params: CreateTriggerParams) {
            // GAP: @mobilerun/sdk's TriggerCreateParams.scheduleRule has no
            // `jitter` field in its public type (verified against
            // workflows/triggers.d.ts). Forwarded anyway via a loose cast (the
            // wire body is a plain JSON object, so an extra key reaches the API
            // if it's actually supported server-side) rather than silently
            // dropped — but whether the public API honors it is UNVERIFIED.
            return client.workflows.triggers.create({
                name: params.name,
                activation: params.activation,
                eventType: params.eventType,
                scheduleRule: params.scheduleRule as CreateTriggerParams['scheduleRule'] & { jitter?: unknown },
                customPayloadSchema: params.customPayloadSchema,
                timezone: params.timezone,
                description: params.description,
                conditions: params.conditions,
            });
        },
        async listFlows(opts: ListFlowsOpts) {
            return client.workflows.flows.list({
                enabled: opts.enabled,
                search: opts.search,
                triggerId: opts.triggerId,
                page: opts.page,
                pageSize: opts.pageSize,
            });
        },
        async getFlow(id: string) {
            return client.workflows.flows.retrieve(id);
        },
        async createFlow(params: CreateFlowParams) {
            return client.workflows.flows.create({
                name: params.name,
                triggerId: params.triggerId,
                actions: params.actions,
                deviceIds: params.deviceIds,
                description: params.description,
                cooldownSeconds: params.cooldownSeconds,
                cooldownScope: params.cooldownScope,
            });
        },
        async listExecutions(opts: ListExecutionsOpts) {
            return client.workflows.executions.list({
                flowId: opts.flowId,
                triggerId: opts.triggerId,
                status: opts.status,
                // SDK's ExecutionListParams has no `limit` — it paginates via
                // page/pageSize instead. `limit` is mapped onto `pageSize` here
                // as the closest analog.
                pageSize: opts.limit,
            });
        },
        async getExecution(id: string) {
            return client.workflows.executions.retrieve(id);
        },
        async cloneFlow(params: CloneFlowParams) {
            return client.workflows.flows.clone(params.flowId, { name: params.name, deviceIds: params.deviceIds });
        },
        async unblockFlow(flowId: string) {
            return client.workflows.flows.unblock(flowId);
        },
        async addFlowAction(params: AddFlowActionParams) {
            return client.workflows.flows.actions.add(params.flowId, {
                actionId: params.actionId,
                position: params.position,
                children: params.children,
                continueOnError: params.continueOnError,
                nameOverride: params.nameOverride,
                overrides: params.overrides,
                parentFlowActionId: params.parentFlowActionId,
            });
        },
        async removeFlowAction(params: RemoveFlowActionParams) {
            return client.workflows.flows.actions.remove(params.flowActionId, { flowId: params.flowId });
        },
        async replaceFlowActions(params: ReplaceFlowActionsParams) {
            // SDK's ActionReplaceResponse is `{ data: FlowAction[] }`, not
            // `{ items }` — normalized to this port's list-shape convention.
            const response = await client.workflows.flows.actions.replace(params.flowId, { actions: params.actions });
            return { items: response.data };
        },
        async getExecutionMetrics(opts: ExecutionMetricsOpts) {
            return client.workflows.executions.getMetrics({
                flowId: opts.flowId,
                triggerId: opts.triggerId,
                from: opts.from,
                to: opts.to,
            });
        },
        async listServices() {
            // SDK's ServiceListResponse.data is a plain `string[]`; the port's
            // ServiceListDto types it as `WorkflowService[]` (the same fixed
            // union the rest of this file uses for the `service` filter) since
            // the API's known services are exactly that set today.
            const response = await client.workflows.actions.services.list();
            return { items: response.data as WorkflowService[] };
        },
        async listServiceMethods(service: string) {
            const response = await client.workflows.actions.services.listMethods(service);
            return { items: response.data };
        },
        async ingestEvent(params: IngestEventParams) {
            return client.workflows.events.ingest({ eventType: params.eventType, payload: params.payload });
        },
        async dryRunEvent(params: DryRunEventParams) {
            return client.workflows.events.dryRun({ eventType: params.eventType, payload: params.payload });
        },
        async registerEventTypes(params: RegisterEventTypesParams) {
            return client.workflows.events.catalog.register({ events: params.events });
        },
    };
}
