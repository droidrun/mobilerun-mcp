import { operation, registerBundle } from './operation-table.js';
// Tasks tools (the platform's core product) — built directly against
// @mobilerun/sdk's public surface.
//
// SSE endpoints (POST /tasks/stream, GET /tasks/{id}/attach) are
// deliberately NOT mapped: they don't fit the
// request/response MCP tool model. `run_task` is the non-streamed `POST
// /tasks` variant; `get_task(view: 'status'|'trajectory')` is the documented
// polling substitute for following a running task.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { RawTaskTrajectoryDto } from '../backend/tasks.js';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
// Hard cap on trajectory events returned per call — a running/long task's
// trajectory has one entry per agent step, screenshot, tool call, LLM
// response, ... and can otherwise blow the LLM context (same rationale as
// ui-state.ts's MAX_NODES/MAX_BYTES for the a11y tree). Callers page through
// the rest via `offset`/the returned `nextOffset`.
const MAX_TRAJECTORY_EVENTS = 50;
export interface CompactTrajectory {
    total: number;
    offset: number;
    eventCount: number;
    hasMore: boolean;
    nextOffset?: number;
    events: RawTaskTrajectoryDto['events'];
}
export function compactTrajectory(raw: RawTaskTrajectoryDto, offset = 0, limit = MAX_TRAJECTORY_EVENTS): CompactTrajectory {
    const start = Math.max(0, Math.floor(offset));
    const cappedLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_TRAJECTORY_EVENTS);
    const total = raw.events.length;
    const events = raw.events.slice(start, start + cappedLimit);
    const nextOffset = start + events.length;
    const hasMore = nextOffset < total;
    return {
        total,
        offset: start,
        eventCount: events.length,
        hasMore,
        ...(hasMore ? { nextOffset } : {}),
        events,
    };
}
const GET_TASK_SHARED_FIELDS = {
    taskId: z.string(),
    offset: z.number().int().min(0).optional().describe('view=trajectory only. 0-based event index to start from.'),
    limit: z
        .number()
        .int()
        .positive()
        .max(MAX_TRAJECTORY_EVENTS)
        .optional()
        .describe(`view=trajectory only. Max ${MAX_TRAJECTORY_EVENTS} events per call.`),
};

const GET_TASK_INTRO = 'Fetch one task by id, chosen via view. Poll status or trajectory to follow a running task.';
export const GET_TASK_TABLE = [
    operation({
        op: 'summary',
        input: {
            taskId: GET_TASK_SHARED_FIELDS.taskId,
            offset: GET_TASK_SHARED_FIELDS.offset,
            limit: GET_TASK_SHARED_FIELDS.limit,
        },
        access: 'read',
        doc: 'Read the full task record, minus trajectory.',
        run: async (ctx, input) => asTextResult(await ctx.backend.tasks.getTaskSummary(input.taskId)),
    }),
    operation({
        op: 'status',
        input: {
            taskId: GET_TASK_SHARED_FIELDS.taskId,
            offset: GET_TASK_SHARED_FIELDS.offset,
            limit: GET_TASK_SHARED_FIELDS.limit,
        },
        access: 'read',
        doc: 'Read lightweight polling fields: status/message/output/steps/succeeded.',
        run: async (ctx, input) => asTextResult(await ctx.backend.tasks.getTaskStatus(input.taskId)),
    }),
    operation({
        op: 'trajectory',
        input: {
            taskId: GET_TASK_SHARED_FIELDS.taskId,
            offset: GET_TASK_SHARED_FIELDS.offset,
            limit: GET_TASK_SHARED_FIELDS.limit,
        },
        access: 'read',
        doc: 'Read the paged agent event log, capped per call; page with offset and the returned nextOffset.',
        run: async (ctx, input) => {
            const { taskId, offset, limit } = input;
            const raw = await ctx.backend.tasks.getTaskTrajectory(taskId);
            return asTextResult(compactTrajectory(raw, offset, limit));
        },
    }),
] as const;
const GET_TASK_MEDIA_SHARED_FIELDS = {
    taskId: z.string(),
    index: z.number().int().nonnegative().optional(),
};

const GET_TASK_MEDIA_INTRO =
    "Fetch a task's captured media, chosen via kind. Omit index to list all available URLs for that kind; pass index to fetch one specific item's URL. URLs are short-lived signed links, not embedded blobs.";
export const GET_TASK_MEDIA_TABLE = [
    operation({
        op: 'screenshot',
        input: { taskId: GET_TASK_MEDIA_SHARED_FIELDS.taskId, index: GET_TASK_MEDIA_SHARED_FIELDS.index },
        access: 'read',
        doc: 'Read captured screenshot URLs.',
        run: async (ctx, input) => asTextResult(await ctx.backend.tasks.getTaskMedia(input.operation, input.taskId, input.index)),
    }),
    operation({
        op: 'ui_state',
        input: { taskId: GET_TASK_MEDIA_SHARED_FIELDS.taskId, index: GET_TASK_MEDIA_SHARED_FIELDS.index },
        access: 'read',
        doc: 'Read captured UI state URLs.',
        run: async (ctx, input) => asTextResult(await ctx.backend.tasks.getTaskMedia(input.operation, input.taskId, input.index)),
    }),
] as const;

// Union of the global (client.tasks.list) and device-scoped
// (client.devices.tasks.list) `orderBy` enums (verified against the SDK's
// shipped tasks.d.ts / devices/tasks.d.ts) — the two endpoints don't share
// one enum. `query`/`status` only exist on the global endpoint. Rejecting a
// device-scoped-only or global-only field for the wrong branch mirrors
// workflows.ts's disallowedFilterError pattern rather than silently
// dropping it.
const LIST_TASKS_ORDER_BY = ['id', 'createdAt', 'finishedAt', 'status', 'updatedAt', 'assignedAt'] as const;
const GLOBAL_ONLY_ORDER_BY = new Set(['finishedAt', 'status']);
const DEVICE_ONLY_ORDER_BY = new Set(['updatedAt', 'assignedAt']);
const TASK_STATUSES = ['queued', 'created', 'running', 'cancelling', 'paused', 'completed', 'failed', 'cancelled'] as const;
function listTasksValidationError(input: {
    deviceId?: string;
    orderBy?: string;
    query?: string;
    status?: string;
}): string | null {
    if (input.deviceId) {
        if (input.query !== undefined) return 'list_tasks: `query` is only valid without `deviceId` (device-scoped listing has no search).';
        if (input.status !== undefined) return 'list_tasks: `status` is only valid without `deviceId` (device-scoped listing has no status filter).';
        if (input.orderBy && GLOBAL_ONLY_ORDER_BY.has(input.orderBy)) {
            return `list_tasks: orderBy="${input.orderBy}" is only valid without \`deviceId\`; device-scoped orderBy is one of id, createdAt, updatedAt, assignedAt.`;
        }
    } else if (input.orderBy && DEVICE_ONLY_ORDER_BY.has(input.orderBy)) {
        return `list_tasks: orderBy="${input.orderBy}" is only valid with \`deviceId\` set; global orderBy is one of id, createdAt, finishedAt, status.`;
    }
    return null;
}
export function registerTaskTools(server: McpServer, ctx: ToolCtx): void {
    server.registerTool(
        'run_task',
        {
            description:
                'Dispatch a new agent task on a device. Returns immediately with the task id and its initial status (queued or created); poll get_task(view: "status") or get_task(view: "trajectory") to follow progress.',
            inputSchema: {
                deviceId: z.string(),
                task: z.string().min(1).describe('Natural-language task instruction.'),
                llmModel: z.string().optional().describe("e.g. 'gemini/gemini-2.5-flash'."),
                maxSteps: z.number().int().positive().optional(),
                outputSchema: z.record(z.string(), z.unknown()).nullable().optional().describe('JSON Schema for structured output.'),
                pacedInput: z.boolean().optional().describe('Run the agent with paced device input (variable timing and gesture paths).'),
                vision: z.boolean().optional(),
                apps: z.array(z.string()).optional().describe('Package names the task may use.'),
                credentials: z
                    .array(z.object({ credentialNames: z.array(z.string()), packageName: z.string() }))
                    .optional()
                    .describe('Credential packages the task may use.'),
                files: z.array(z.string()).optional(),
            },
        },
        // The API names `pacedInput` `stealth`.
        async ({ pacedInput, ...params }) => asTextResult(await ctx.backend.tasks.runTask({ ...params, stealth: pacedInput })),
    );
    registerBundle(server, ctx, 'get_task', GET_TASK_TABLE, {
        intro: GET_TASK_INTRO,
        shared: GET_TASK_SHARED_FIELDS,
        field: 'view',
    });
    server.registerTool(
        'list_tasks',
        {
            description:
                'List tasks, optionally filtered to one device. Without `deviceId`: global listing (all owned tasks), supports `query` (search in task description) and `status`. With `deviceId`: device-scoped listing with a slimmer item shape (taskId/createdAt/updatedAt only, no `query`/`status`, different `orderBy` set). Response carries `deviceScoped` so callers can tell which item shape they got.',
            inputSchema: {
                deviceId: z.string().optional(),
                orderBy: z.enum(LIST_TASKS_ORDER_BY).optional(),
                orderByDirection: z.enum(['asc', 'desc']).optional(),
                page: z.number().int().positive().optional(),
                pageSize: z.number().int().positive().optional(),
                query: z.string().optional().describe('Search in task description. Only valid without deviceId.'),
                status: z.enum(TASK_STATUSES).optional().describe('Only valid without deviceId.'),
            },
        },
        async (input) => {
            const err = listTasksValidationError(input);
            if (err) throw new Error(err);
            return asTextResult(await ctx.backend.tasks.listTasks(input));
        },
    );
    server.registerTool(
        'stop_task',
        {
            description: 'Cancel a running task. Errors if the task is already in a terminal state.',
            inputSchema: { taskId: z.string() },
        },
        async ({ taskId }) => asTextResult(await ctx.backend.tasks.stopTask(taskId)),
    );
    server.registerTool(
        'send_task_message',
        {
            description:
                'Send a message to a running agent task (e.g. extra instructions or an answer to a question it raised). Delivery is queued, not synchronous — the trajectory records a UserMessageEvent (queued -> applied|dropped) once the agent picks it up.',
            inputSchema: { taskId: z.string(), message: z.string().min(1) },
        },
        async ({ taskId, message }) => asTextResult(await ctx.backend.tasks.sendTaskMessage(taskId, message)),
    );
    registerBundle(server, ctx, 'get_task_media', GET_TASK_MEDIA_TABLE, {
        intro: GET_TASK_MEDIA_INTRO,
        shared: GET_TASK_MEDIA_SHARED_FIELDS,
        field: 'kind',
    });
}
