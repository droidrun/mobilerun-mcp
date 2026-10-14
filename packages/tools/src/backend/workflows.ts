// Workflows port — see devices.ts's file header for the DTO philosophy.
// DTOs mirror @mobilerun/sdk's action-catalog / actions / triggers / flows /
// executions response shapes (verified against the SDK's
// shipped .d.ts), trimmed to what the tools surface.

import { z } from 'zod';
import { type PageMeta } from './devices.js';

export type WorkflowService = 'tasks_api' | 'devices_api' | 'agents_api' | 'webhooks' | 'integrations_api';

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
export interface CreateActionParams {
    catalogEntryId: string;
    name: string;
    description?: string;
    isAsync?: boolean;
    params?: Record<string, unknown>;
}

export const scheduleRuleSchema = z.object({
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

export type ScheduleRule = z.infer<typeof scheduleRuleSchema>;

export function isScheduleRule(value: unknown): value is ScheduleRule {
    return scheduleRuleSchema.safeParse(value).success;
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
    // Stable per-step id (template resolution v3: `{{steps.<key>.body.<field>}}`).
    // Optional on input — derived server-side when omitted on create/add, and
    // by this tool when omitted on replace_actions (see tools/step-key.ts).
    key?: string;
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
interface ActionCatalogEntryDto {
    id: string;
    name: string;
    description: string | null;
    method: string;
    service: WorkflowService;
    createdAt: string | null;
    updatedAt: string | null;
    paramsSchema?: unknown;
}
interface ActionCatalogListDto {
    items: ActionCatalogEntryDto[];
    pagination: PageMeta;
}
interface ActionCatalogEntryEnvelopeDto {
    data: ActionCatalogEntryDto;
}

interface ActionDto {
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
interface ActionListDto {
    items: ActionDto[];
    pagination: PageMeta;
}
interface ActionEnvelopeDto {
    data: ActionDto;
}

interface TriggerDto {
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
interface TriggerListDto {
    items: TriggerDto[];
    pagination: PageMeta;
}
interface TriggerEnvelopeDto {
    data: TriggerDto;
}

interface FlowDto {
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
    // Which step-reference syntax this flow's action params use: 3 means
    // `{{steps.<key>.body.<field>}}` / `{{event.payload.*}}` only; 1/2 mean
    // the older name/slug-based syntax. Optional/defensive: not yet typed by
    // @mobilerun/sdk's Flow response type, so treat as "present when the API
    // sends it" rather than assuming every flow has it.
    // @mobilerun/sdk declares this as number; known API values are 1, 2, and 3.
    templateResolutionVersion?: number;
}
interface FlowListDto {
    items: FlowDto[];
    pagination: PageMeta;
}
interface FlowEnvelopeDto {
    data: FlowDto;
}

interface FlowExecutionDto {
    id: string;
    flowId: string;
    flowName: string | null;
    triggerId: string;
    triggerName: string | null;
    status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'skipped' | 'invalid' | null;
    kind: 'live' | 'dry_run' | 'verification';
    error: string | null;
    eventId: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    result?: unknown;
}
interface ExecutionListDto {
    items: FlowExecutionDto[];
    pagination: PageMeta;
}
interface ExecutionEnvelopeDto {
    data: FlowExecutionDto;
}

interface ExecutionMetricsDto {
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
    // Stable per-step id. The API now returns this on every flow action.
    key: string;
}
interface FlowActionEnvelopeDto {
    data: FlowActionDto;
}
interface FlowActionListDto {
    items: FlowActionDto[];
}
interface RemoveFlowActionResultDto {
    message: string;
}

interface ServiceListDto {
    items: WorkflowService[];
}
interface ServiceMethodDto {
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
interface ServiceMethodListDto {
    items: ServiceMethodDto[];
}

interface EventIngestResultDto {
    eventId: string;
}
interface EventDryRunMatchedFlowActionDto {
    name: string;
    method: string;
    service: WorkflowService;
    continueOnError: boolean;
    params?: unknown;
}
interface EventDryRunGatesDto {
    blocked: boolean;
    cooldownActive: boolean | null;
    deviceAttached: boolean;
    deviceIds: string[];
    enabled: boolean;
}
interface EventDryRunMatchedFlowDto {
    flow: FlowDto;
    trigger: TriggerDto;
    actions: EventDryRunMatchedFlowActionDto[];
    gates: EventDryRunGatesDto;
    wouldFire: boolean;
}
interface EventDryRunResultDto {
    data: {
        matchedFlows: EventDryRunMatchedFlowDto[];
        validation: {
            valid: boolean;
            errors?: Array<{ field: string; message: string }>;
        };
    };
}
export interface WorkflowsBackend {
    manageFlowExecutionScreenshot(params: z.infer<typeof manageFlowExecutionScreenshotSchema>): Promise<unknown>;
    manageFlowUpdate(params: z.infer<typeof manageFlowUpdateSchema>): Promise<unknown>;
    manageFlowDelete(params: z.infer<typeof manageFlowDeleteSchema>): Promise<unknown>;
    manageFlowActivate(params: z.infer<typeof manageFlowActivateSchema>): Promise<unknown>;
    manageFlowRun(params: z.infer<typeof manageFlowRunSchema>): Promise<unknown>;
    manageFlowValidate(params: z.infer<typeof manageFlowValidateSchema>): Promise<unknown>;
    manageFlowVerify(params: z.infer<typeof manageFlowVerifySchema>): Promise<unknown>;
    manageFlowDryRun(params: z.infer<typeof manageFlowDryRunSchema>): Promise<unknown>;
    manageFlowCapacity(): Promise<unknown>;
    manageFlowDeliveryOptions(params: z.infer<typeof manageFlowDeliveryOptionsSchema>): Promise<unknown>;
    manageFlowTemplateContext(params: z.infer<typeof manageFlowTemplateContextSchema>): Promise<unknown>;
    manageFlowListRepairs(params: z.infer<typeof manageFlowListRepairsSchema>): Promise<unknown>;
    manageFlowUpdateAction(params: z.infer<typeof manageFlowUpdateActionSchema>): Promise<unknown>;
    manageFlowDeleteAction(params: z.infer<typeof manageFlowDeleteActionSchema>): Promise<unknown>;
    manageFlowUpdateTrigger(params: z.infer<typeof manageFlowUpdateTriggerSchema>): Promise<unknown>;
    manageFlowDeleteTrigger(params: z.infer<typeof manageFlowDeleteTriggerSchema>): Promise<unknown>;
    manageFlowFireTrigger(params: z.infer<typeof manageFlowFireTriggerSchema>): Promise<unknown>;
    manageFlowAbortExecution(params: z.infer<typeof manageFlowAbortExecutionSchema>): Promise<unknown>;
    listActionCatalog(opts: ListActionCatalogOpts): Promise<ActionCatalogListDto>;
    getActionCatalogEntry(id: string): Promise<ActionCatalogEntryEnvelopeDto>;
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
    // Internal-only (not a tool surface): used by manage_flow's replace_actions
    // to look up each existing step's key before a full replace. See
    // tools/step-key.ts.
    listFlowActions(flowId: string): Promise<FlowActionListDto>;
    listExecutions(opts: ListExecutionsOpts): Promise<ExecutionListDto>;
    getExecution(id: string): Promise<ExecutionEnvelopeDto>;
    getExecutionMetrics(opts: ExecutionMetricsOpts): Promise<ExecutionMetricsDto>;
    listServices(): Promise<ServiceListDto>;
    listServiceMethods(service: string): Promise<ServiceMethodListDto>;
    ingestEvent(params: IngestEventParams): Promise<EventIngestResultDto>;
    dryRunEvent(params: DryRunEventParams): Promise<EventDryRunResultDto>;
}

export const manageFlowUpdateSchema = z
    .object({
        flowId: z.string(),
        cooldownScope: z.union([z.literal('flow'), z.literal('device')]).optional(),
        cooldownSeconds: z.union([z.number(), z.null()]).optional(),
        delivery: z
            .union([
                z
                    .object({
                        destination: z.union([
                            z.literal('mobilerun'),
                            z.literal('one_drive'),
                            z.literal('google_drive'),
                        ]),
                        folder: z.string().optional(),
                        recording: z.object({ filename: z.string() }).strict().optional(),
                        screenshots: z.unknown().optional(),
                    })
                    .strict(),
                z.null(),
            ])
            .optional(),
        description: z.string().optional(),
        deviceIds: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
        healthMonitoringEnabled: z.boolean().optional(),
        lifecycleStatus: z.union([z.literal('enabled'), z.literal('disabled')]).optional(),
        name: z.string().optional(),
        notifyOnFailure: z.boolean().optional(),
        notifyOnSuccess: z.boolean().optional(),
        notifyWebhookId: z.union([z.string(), z.null()]).optional(),
        recordingEnabled: z.boolean().optional(),
        recordingPolicy: z
            .object({ mode: z.union([z.literal('off'), z.literal('flow'), z.literal('selected_steps')]) })
            .strict()
            .optional(),
        selfHealingEnabled: z.boolean().optional(),
        selfHealingMaxAttempts: z.number().optional(),
        triggerId: z.string().optional(),
    })
    .strict();

export const manageFlowDeleteSchema = z
    .object({
        flowId: z.string(),
    })
    .strict();

export const manageFlowActivateSchema = z
    .object({
        flowId: z.string(),
        verificationExecutionId: z.string(),
    })
    .strict();

export const manageFlowRunSchema = z
    .object({
        flowId: z.string(),
        captureScreenshots: z.boolean().optional(),
        payload: z.record(z.string(), z.unknown()).optional(),
    })
    .strict();

export const manageFlowValidateSchema = z
    .object({
        actions: z.array(
            z.union([
                z
                    .object({
                        actionId: z.string(),
                        position: z.number(),
                        children: z
                            .array(
                                z
                                    .object({
                                        actionId: z.string(),
                                        position: z.number(),
                                        continueOnError: z.boolean().optional(),
                                        key: z.string().optional(),
                                        nameOverride: z.string().optional(),
                                        overrides: z
                                            .union([
                                                z
                                                    .object({ params: z.record(z.string(), z.unknown()).optional() })
                                                    .strict(),
                                                z.null(),
                                            ])
                                            .optional(),
                                        recordingEnabled: z.boolean().optional(),
                                    })
                                    .strict(),
                            )
                            .optional(),
                        continueOnError: z.boolean().optional(),
                        key: z.string().optional(),
                        nameOverride: z.string().optional(),
                        overrides: z
                            .union([
                                z.object({ params: z.record(z.string(), z.unknown()).optional() }).strict(),
                                z.null(),
                            ])
                            .optional(),
                        recordingEnabled: z.boolean().optional(),
                    })
                    .strict(),
                z
                    .object({
                        draft: z
                            .object({
                                method: z.string(),
                                name: z.string(),
                                service: z.string(),
                                params: z.record(z.string(), z.unknown()).optional(),
                            })
                            .strict(),
                        position: z.number(),
                        continueOnError: z.boolean().optional(),
                        key: z.string().optional(),
                        nameOverride: z.string().optional(),
                        overrides: z
                            .union([
                                z.object({ params: z.record(z.string(), z.unknown()).optional() }).strict(),
                                z.null(),
                            ])
                            .optional(),
                        recordingEnabled: z.boolean().optional(),
                    })
                    .strict(),
            ]),
        ),
        name: z.string(),
        cooldownScope: z.union([z.literal('flow'), z.literal('device')]).optional(),
        cooldownSeconds: z.union([z.number(), z.null()]).optional(),
        delivery: z
            .object({
                destination: z.union([z.literal('mobilerun'), z.literal('one_drive'), z.literal('google_drive')]),
                folder: z.string().optional(),
                recording: z.object({ filename: z.string() }).strict().optional(),
                screenshots: z.unknown().optional(),
            })
            .strict()
            .optional(),
        description: z.string().optional(),
        deviceIds: z.array(z.string()).optional(),
        enabled: z.boolean().optional(),
        healthMonitoringEnabled: z.boolean().optional(),
        notifyOnFailure: z.boolean().optional(),
        notifyOnSuccess: z.boolean().optional(),
        notifyWebhookId: z.union([z.string(), z.null()]).optional(),
        recordingEnabled: z.boolean().optional(),
        recordingPolicy: z
            .object({ mode: z.union([z.literal('off'), z.literal('flow'), z.literal('selected_steps')]) })
            .strict()
            .optional(),
        selfHealingEnabled: z.boolean().optional(),
        selfHealingMaxAttempts: z.number().optional(),
        triggerId: z.string().optional(),
    })
    .strict();

export const manageFlowVerifySchema = z
    .object({
        flowId: z.string(),
        invocationId: z.string(),
        deviceId: z.string().optional(),
        payload: z.record(z.string(), z.unknown()).optional(),
    })
    .strict();

export const manageFlowDryRunSchema = z
    .object({
        flowId: z.string(),
        payload: z.record(z.string(), z.unknown()).optional(),
    })
    .strict();

export const manageFlowCapacitySchema = z.object({}).strict();

export const manageFlowDeliveryOptionsSchema = z
    .object({
        flowId: z.string(),
    })
    .strict();

export const manageFlowTemplateContextSchema = z
    .object({
        templateResolutionVersion: z.number().optional(),
    })
    .strict();

export const manageFlowListRepairsSchema = z
    .object({
        flowId: z.string(),
    })
    .strict();

export const manageFlowUpdateActionSchema = z
    .object({
        actionId: z.string(),
        description: z.string().optional(),
        name: z.string().optional(),
        params: z.record(z.string(), z.unknown()).optional(),
    })
    .strict();

export const manageFlowDeleteActionSchema = z
    .object({
        actionId: z.string(),
    })
    .strict();

export const manageFlowUpdateTriggerSchema = z
    .object({
        triggerId: z.string(),
        activation: z.union([z.literal('event'), z.literal('schedule'), z.literal('custom')]).optional(),
        conditions: z
            .union([
                z.object({ all: z.array(z.unknown()).optional(), any: z.array(z.unknown()).optional() }).strict(),
                z.null(),
            ])
            .optional(),
        customPayloadSchema: z.union([z.record(z.string(), z.unknown()), z.null()]).optional(),
        description: z.string().optional(),
        eventType: z.string().optional(),
        name: z.string().optional(),
        scheduleRule: z
            .union([
                z
                    .object({
                        type: z.union([z.literal('once'), z.literal('cron'), z.literal('recurring')]),
                        dateTime: z.string().optional(),
                        expression: z.string().optional(),
                        jitter: z
                            .object({ afterMinutes: z.number().optional(), beforeMinutes: z.number().optional() })
                            .strict()
                            .optional(),
                        rrule: z.string().optional(),
                    })
                    .strict(),
                z.null(),
            ])
            .optional(),
        timezone: z.union([z.string(), z.null()]).optional(),
    })
    .strict();

export const manageFlowDeleteTriggerSchema = z
    .object({
        triggerId: z.string(),
    })
    .strict();

export const manageFlowFireTriggerSchema = z
    .object({
        triggerId: z.string(),
        payload: z.record(z.string(), z.unknown()),
    })
    .strict();

export const manageFlowAbortExecutionSchema = z
    .object({
        executionId: z.string(),
    })
    .strict();

export const manageFlowExecutionScreenshotSchema = z
    .object({ executionId: z.string(), screenshotId: z.string() })
    .strict();
