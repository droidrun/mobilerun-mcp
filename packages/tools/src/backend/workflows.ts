// Workflows port — see devices.ts's file header for the DTO philosophy.
// DTOs mirror @mobilerun/sdk's action-catalog / actions / triggers / flows /
// executions / events.catalog response shapes (verified against the SDK's
// shipped .d.ts), trimmed to what the tools surface.
import type { PageMeta } from './devices.js';

export type WorkflowService = 'tasks_api' | 'devices_api' | 'agents_api' | 'webhooks';

export interface ListActionCatalogOpts {
    service?: WorkflowService;
}
export interface ListActionsOpts {
    service?: WorkflowService;
    search?: string;
    page?: number;
    pageSize?: number;
}
export interface ListTriggersOpts {
    activation?: 'event' | 'schedule' | 'custom';
    eventType?: string;
    search?: string;
    page?: number;
    pageSize?: number;
}
export interface ListFlowsOpts {
    enabled?: boolean;
    search?: string;
    triggerId?: string;
    page?: number;
    pageSize?: number;
}
export interface ListExecutionsOpts {
    flowId?: string;
    triggerId?: string;
    status?: 'pending' | 'running' | 'success' | 'failed';
    limit?: number;
}
export interface ExecutionMetricsOpts {
    flowId?: string;
    triggerId?: string;
    from?: string | null;
    to?: string | null;
}
export interface ListAppEventCatalogOpts {
    source?: 'device' | 'system' | 'webhook';
    page?: number;
    pageSize?: number;
}

export interface CreateActionParams {
    catalogEntryId: string;
    name: string;
    description?: string;
    isAsync?: boolean;
    params?: Record<string, unknown>;
}

export interface ScheduleRule {
    type: 'once' | 'cron' | 'recurring';
    dateTime?: string;
    expression?: string;
    rrule?: string;
    jitter?: { beforeMinutes?: number; afterMinutes?: number };
}

export interface CreateTriggerParams {
    name: string;
    activation: 'event' | 'schedule' | 'custom';
    eventType?: string;
    scheduleRule?: ScheduleRule;
    customPayloadSchema?: Record<string, unknown>;
    timezone?: string;
    description?: string;
    conditions?: { all?: unknown[]; any?: unknown[] };
}

export interface FlowActionOverrides {
    params?: Record<string, unknown>;
}
export interface FlowChildActionInput {
    actionId: string;
    position: number;
    continueOnError?: boolean;
    nameOverride?: string;
    overrides?: FlowActionOverrides | null;
}
export interface FlowActionBinding extends FlowChildActionInput {
    children?: FlowChildActionInput[];
}

export interface CreateFlowParams {
    name: string;
    triggerId: string;
    actions: FlowActionBinding[];
    deviceIds: string[];
    description?: string;
    cooldownSeconds?: number;
    cooldownScope?: 'flow' | 'device';
}

export interface CloneFlowParams {
    flowId: string;
    name?: string;
    deviceIds?: string[];
}

export interface AddFlowActionParams extends FlowActionBinding {
    flowId: string;
    parentFlowActionId?: string | null;
}

export interface RemoveFlowActionParams {
    flowActionId: string;
    flowId: string;
}

export interface ReplaceFlowActionsParams {
    flowId: string;
    actions: FlowActionBinding[];
}

export interface IngestEventParams {
    eventType: string;
    payload?: Record<string, unknown>;
}
export interface DryRunEventParams {
    eventType: string;
    payload?: Record<string, unknown>;
}
export interface RegisterEventTypesParams {
    events: Array<{
        eventType: string;
        label: string;
        description?: string;
        payloadSchema?: Record<string, unknown>;
        source?: 'device' | 'system' | 'webhook';
    }>;
}

export interface ActionCatalogEntryDto {
    id: string;
    name: string;
    description: string | null;
    method: string;
    service: WorkflowService;
    createdAt: string | null;
    updatedAt: string | null;
    paramsSchema?: unknown;
}
export interface ActionCatalogListDto {
    items: ActionCatalogEntryDto[];
    pagination: PageMeta;
}
export interface ActionCatalogEntryEnvelopeDto {
    data: ActionCatalogEntryDto;
}

export interface AppEventCatalogItemDto {
    eventType: string;
    label: string;
    description: string | null;
    source: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    payloadSchema?: unknown;
}
export interface AppEventCatalogListDto {
    items: AppEventCatalogItemDto[];
    pagination: PageMeta;
}

export interface ActionDto {
    id: string;
    catalogEntryId: string;
    name: string;
    description: string | null;
    method: string;
    service: WorkflowService;
    userId: string;
    createdAt: string | null;
    updatedAt: string | null;
    params?: unknown;
    paramsSchema?: unknown;
}
export interface ActionListDto {
    items: ActionDto[];
    pagination: PageMeta;
}
export interface ActionEnvelopeDto {
    data: ActionDto;
}

export interface TriggerDto {
    id: string;
    activation: 'event' | 'schedule' | 'custom';
    name: string;
    description: string | null;
    eventType: string | null;
    scheduleRule: ScheduleRule | null;
    customPayloadSchema: Record<string, unknown> | null;
    timezone: string | null;
    userId: string;
    createdAt: string | null;
    updatedAt: string | null;
    conditions?: unknown;
    nextFireTime?: string | null;
}
export interface TriggerListDto {
    items: TriggerDto[];
    pagination: PageMeta;
}
export interface TriggerEnvelopeDto {
    data: TriggerDto;
}

export interface FlowDto {
    id: string;
    name: string;
    description: string | null;
    triggerId: string;
    deviceIds: string[];
    enabled: boolean;
    status: 'healthy' | 'failing' | 'blocked';
    cooldownScope: 'flow' | 'device';
    cooldownSeconds: number | null;
    lastTriggeredAt: string | null;
    lastFailureAt: string | null;
    lastFailureCode: string | null;
    userId: string;
    createdAt: string | null;
    updatedAt: string | null;
}
export interface FlowListDto {
    items: FlowDto[];
    pagination: PageMeta;
}
export interface FlowEnvelopeDto {
    data: FlowDto;
}

export interface FlowExecutionDto {
    id: string;
    flowId: string;
    flowName: string | null;
    triggerId: string;
    triggerName: string | null;
    status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'skipped' | 'invalid' | null;
    kind: 'live' | 'dry_run';
    error: string | null;
    eventId: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    result?: unknown;
}
export interface ExecutionListDto {
    items: FlowExecutionDto[];
    pagination: PageMeta;
}
export interface ExecutionEnvelopeDto {
    data: FlowExecutionDto;
}

export interface ExecutionMetricsDto {
    data: {
        avgDurationMs: number | null;
        byStatus: {
            cancelled: number;
            failed: number;
            invalid: number;
            pending: number;
            running: number;
            skipped: number;
            success: number;
        };
        lastExecutionAt: string | null;
        total: number;
    };
}

export interface FlowActionDto {
    id: string;
    actionId: string;
    continueOnError: boolean;
    createdAt: string | null;
    flowId: string;
    nameOverride: string | null;
    overrides: FlowActionOverrides | null;
    parentFlowActionId: string | null;
    position: number;
}
export interface FlowActionEnvelopeDto {
    data: FlowActionDto;
}
export interface FlowActionListDto {
    items: FlowActionDto[];
}
export interface RemoveFlowActionResultDto {
    message: string;
}

export interface ServiceListDto {
    items: WorkflowService[];
}
export interface ServiceMethodDto {
    method: string;
    params: Array<{
        name: string;
        type: 'string' | 'number' | 'boolean' | 'object' | 'array';
        required: boolean;
        description: string;
        default?: unknown;
        example?: unknown;
    }>;
}
export interface ServiceMethodListDto {
    items: ServiceMethodDto[];
}

export interface EventIngestResultDto {
    eventId: string;
}
export interface EventDryRunMatchedFlowActionDto {
    name: string;
    method: string;
    service: WorkflowService;
    continueOnError: boolean;
    params?: unknown;
}
export interface EventDryRunGatesDto {
    blocked: boolean;
    cooldownActive: boolean | null;
    deviceAttached: boolean;
    deviceIds: string[];
    enabled: boolean;
}
export interface EventDryRunMatchedFlowDto {
    flow: FlowDto;
    trigger: TriggerDto;
    actions: EventDryRunMatchedFlowActionDto[];
    gates: EventDryRunGatesDto;
    wouldFire: boolean;
}
export interface EventDryRunResultDto {
    data: {
        matchedFlows: EventDryRunMatchedFlowDto[];
        validation: {
            valid: boolean;
            errors?: Array<{ field: string; message: string }>;
        };
    };
}
export interface RegisterEventTypesResultDto {
    message: string;
}

export interface WorkflowsBackend {
    listActionCatalog(opts: ListActionCatalogOpts): Promise<ActionCatalogListDto>;
    getActionCatalogEntry(id: string): Promise<ActionCatalogEntryEnvelopeDto>;
    listAppEventCatalog(opts?: ListAppEventCatalogOpts): Promise<AppEventCatalogListDto>;
    listActions(opts: ListActionsOpts): Promise<ActionListDto>;
    getAction(id: string): Promise<ActionEnvelopeDto>;
    createAction(params: CreateActionParams): Promise<ActionEnvelopeDto>;
    listTriggers(opts: ListTriggersOpts): Promise<TriggerListDto>;
    getTrigger(id: string): Promise<TriggerEnvelopeDto>;
    createTrigger(params: CreateTriggerParams): Promise<TriggerEnvelopeDto>;
    listFlows(opts: ListFlowsOpts): Promise<FlowListDto>;
    getFlow(id: string): Promise<FlowEnvelopeDto>;
    createFlow(params: CreateFlowParams): Promise<FlowEnvelopeDto>;
    cloneFlow(params: CloneFlowParams): Promise<FlowEnvelopeDto>;
    unblockFlow(flowId: string): Promise<FlowEnvelopeDto>;
    addFlowAction(params: AddFlowActionParams): Promise<FlowActionEnvelopeDto>;
    removeFlowAction(params: RemoveFlowActionParams): Promise<RemoveFlowActionResultDto>;
    replaceFlowActions(params: ReplaceFlowActionsParams): Promise<FlowActionListDto>;
    listExecutions(opts: ListExecutionsOpts): Promise<ExecutionListDto>;
    getExecution(id: string): Promise<ExecutionEnvelopeDto>;
    getExecutionMetrics(opts: ExecutionMetricsOpts): Promise<ExecutionMetricsDto>;
    listServices(): Promise<ServiceListDto>;
    listServiceMethods(service: string): Promise<ServiceMethodListDto>;
    ingestEvent(params: IngestEventParams): Promise<EventIngestResultDto>;
    dryRunEvent(params: DryRunEventParams): Promise<EventDryRunResultDto>;
    registerEventTypes(params: RegisterEventTypesParams): Promise<RegisterEventTypesResultDto>;
}
