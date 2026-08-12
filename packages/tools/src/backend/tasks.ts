// Tasks port — see devices.ts's file header for the DTO philosophy. Mirrors
// @mobilerun/sdk's `client.tasks.*` / `client.devices.tasks.*` response
// shapes (verified against the SDK's shipped .d.ts — see SdkBackend for the
// per-method mapping and the gaps called out below).
//
// Trajectory truncation: `client.tasks.getTrajectory`
// takes no paging params upstream and can return an unbounded event array
// (one entry per agent step, screenshot, tool call, ...). Mirroring
// devices.ts's `DeviceUiStateDto` / `../tools/ui-state.ts` split, this port's
// `getTaskTrajectory` returns the raw (untruncated) event list — capping to
// a page + offset/limit paging is done client-side in `../tools/tasks.ts`
// (`compactTrajectory`), the same layer boundary the UI-state tool uses.
//
// List-shape mismatch (SDK gap, flagged for the orchestrator): the
// device-scoped `client.devices.tasks.list` endpoint returns a much thinner
// item shape (`{ taskId, createdAt, updatedAt }`) than the global
// `client.tasks.list` (full `TaskListResponse.Item`, everything but
// `trajectory`) — these are genuinely different upstream response shapes,
// not a normalization this package should paper over (same rationale as
// webhooks.ts's envelope-shape note). `list_tasks` surfaces two distinct DTO
// item shapes depending on whether `deviceId` is set — documented on
// `TaskListDto` below rather than silently downgrading the richer shape.
import type { PageMeta } from './devices.js';

export type TaskStatus = 'queued' | 'created' | 'running' | 'cancelling' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface PackageCredentialsDto {
    credentialNames: string[];
    packageName: string;
}

export interface RunTaskParams {
    deviceId: string;
    task: string;
    llmModel?: string;
    maxSteps?: number;
    outputSchema?: Record<string, unknown> | null;
    stealth?: boolean;
    vision?: boolean;
    apps?: string[];
    credentials?: PackageCredentialsDto[];
    files?: string[];
}

export interface RunTaskResultDto {
    id: string;
    status: TaskStatus;
    streamUrl?: string | null;
}

export type TaskView = 'summary' | 'status' | 'trajectory';

// view=summary — the full task record minus its `trajectory` field (that
// field is its own view, and can be arbitrarily large — see file header).
export interface TaskSummaryDto {
    id?: string;
    deviceId: string;
    llmModel: string;
    task: string;
    userId: string;
    status?: TaskStatus;
    displayId?: number;
    apps?: string[];
    credentials?: PackageCredentialsDto[];
    files?: string[];
    maxSteps?: number;
    outputSchema?: Record<string, unknown> | null;
    output?: Record<string, unknown> | null;
    message?: string | null;
    steps?: number | null;
    succeeded?: boolean | null;
    creditsUsed?: number | null;
    stealth?: boolean;
    vision?: boolean;
    createdAt?: string;
    updatedAt?: string;
    dispatchedAt?: string | null;
    claimedAt?: string | null;
    finishedAt?: string | null;
    cancelRequestedAt?: string | null;
    streamUrl?: string | null;
}

export interface TaskStatusDto {
    status: TaskStatus;
    lastResponse?: Record<string, unknown> | null;
    message?: string | null;
    output?: Record<string, unknown> | null;
    steps?: number | null;
    succeeded?: boolean | null;
}

// One trajectory event — loosely typed defensively: the SDK's
// TaskGetTrajectoryResponse discriminates ~30 named event variants by
// `event`, each with its own `data` shape (see tasks/tasks.d.ts). This
// package doesn't re-declare all 30 — tools/tasks.ts only needs `event` to
// count/truncate, and passes `data` through as-is.
export interface TrajectoryEventDto {
    event: string;
    data?: unknown;
}

/** Raw (untruncated) trajectory — compacted/paged client-side by ../tools/tasks.ts's compactTrajectory. */
export interface RawTaskTrajectoryDto {
    events: TrajectoryEventDto[];
}

export interface ListTasksOpts {
    deviceId?: string;
    orderBy?: 'id' | 'createdAt' | 'finishedAt' | 'status' | 'updatedAt' | 'assignedAt';
    orderByDirection?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
    /** Only valid when `deviceId` is unset — see ListTasksOpts's caller-side validation in tools/tasks.ts. */
    query?: string;
    /** Only valid when `deviceId` is unset. */
    status?: TaskStatus;
}

// Global (client.tasks.list) list item — TaskListResponse.Item minus `trajectory`.
export interface TaskListItemDto {
    id: string;
    deviceId: string;
    displayId: number;
    llmModel: string;
    status: TaskStatus;
    task: string;
    userId: string;
    tmpDevice: boolean;
    createdAt?: string;
    finishedAt?: string | null;
    message?: string | null;
    output?: Record<string, unknown> | null;
    steps?: number | null;
    succeeded?: boolean | null;
    creditsUsed?: number | null;
}

// Device-scoped (client.devices.tasks.list) list item — genuinely thinner
// upstream shape, see file header.
export interface DeviceTaskListItemDto {
    taskId: string;
    createdAt: string;
    updatedAt: string;
}

export interface TaskListDto {
    items: TaskListItemDto[] | DeviceTaskListItemDto[] | null;
    pagination: PageMeta;
    /** True when `items` is the thinner device-scoped shape (`DeviceTaskListItemDto[]`). */
    deviceScoped: boolean;
}

export interface StopTaskResultDto {
    cancelled: boolean;
}

export interface SendTaskMessageResultDto {
    sent: boolean;
}

export type TaskMediaKind = 'screenshot' | 'ui_state';

export interface TaskMediaUrlDto {
    url: string;
}

export interface TaskMediaListDto {
    urls: string[];
}

export interface TasksBackend {
    runTask(params: RunTaskParams): Promise<RunTaskResultDto>;
    getTaskSummary(taskId: string): Promise<TaskSummaryDto>;
    getTaskStatus(taskId: string): Promise<TaskStatusDto>;
    getTaskTrajectory(taskId: string): Promise<RawTaskTrajectoryDto>;
    listTasks(opts: ListTasksOpts): Promise<TaskListDto>;
    stopTask(taskId: string): Promise<StopTaskResultDto>;
    sendTaskMessage(taskId: string, message: string): Promise<SendTaskMessageResultDto>;
    getTaskMedia(kind: TaskMediaKind, taskId: string, index?: number): Promise<TaskMediaUrlDto | TaskMediaListDto>;
}
