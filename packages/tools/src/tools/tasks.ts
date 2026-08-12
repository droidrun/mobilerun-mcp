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
import type { ToolCtx } from '../ctx.js';
import type { RawTaskTrajectoryDto, TaskView, TaskMediaKind } from '../backend/tasks.js';
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

const TASK_VIEWS = ['summary', 'status', 'trajectory'] as const;
const TASK_MEDIA_KINDS = ['screenshot', 'ui_state'] as const;

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
                'Dispatch a new agent task on a device. Standalone (non-streamed) variant of POST /tasks — the SSE-streamed variant is not exposed as an MCP tool (see get_task for the polling substitute). Returns immediately with the task id and its initial status (queued or created); poll get_task(view: "status") or get_task(view: "trajectory") to follow progress.',
            inputSchema: {
                deviceId: z.string(),
                task: z.string().min(1).describe('Natural-language task instruction.'),
                llmModel: z.string().optional().describe("e.g. 'gemini/gemini-2.5-flash'."),
                maxSteps: z.number().int().positive().optional(),
                outputSchema: z.record(z.string(), z.unknown()).nullable().optional().describe('JSON Schema for structured output.'),
                stealth: z.boolean().optional(),
                vision: z.boolean().optional(),
                apps: z.array(z.string()).optional().describe('Package names the task may use.'),
                credentials: z
                    .array(z.object({ credentialNames: z.array(z.string()), packageName: z.string() }))
                    .optional()
                    .describe('Credential packages the task may use.'),
                files: z.array(z.string()).optional(),
            },
        },
        async (params) => asTextResult(await ctx.backend.tasks.runTask(params)),
    );

    server.registerTool(
        'get_task',
        {
            description:
                'Fetch one task by id, chosen via `view`: summary (full record, minus trajectory), status (lightweight polling: status/message/output/steps/succeeded), trajectory (paged agent event log — capped per call, page with `offset`/the returned `nextOffset`). No SSE attach/follow — poll status or trajectory instead.',
            inputSchema: {
                view: z.enum(TASK_VIEWS),
                taskId: z.string(),
                offset: z.number().int().min(0).optional().describe('view=trajectory only. 0-based event index to start from.'),
                limit: z
                    .number()
                    .int()
                    .positive()
                    .max(MAX_TRAJECTORY_EVENTS)
                    .optional()
                    .describe(`view=trajectory only. Max ${MAX_TRAJECTORY_EVENTS} events per call.`),
            },
        },
        async ({ view, taskId, offset, limit }: { view: TaskView; taskId: string; offset?: number; limit?: number }) => {
            switch (view) {
                case 'summary':
                    return asTextResult(await ctx.backend.tasks.getTaskSummary(taskId));
                case 'status':
                    return asTextResult(await ctx.backend.tasks.getTaskStatus(taskId));
                case 'trajectory': {
                    const raw = await ctx.backend.tasks.getTaskTrajectory(taskId);
                    return asTextResult(compactTrajectory(raw, offset, limit));
                }
            }
        },
    );

    server.registerTool(
        'list_tasks',
        {
            description:
                'List tasks, optionally filtered to one device. Without `deviceId`: global listing (all owned tasks), supports `query` (search in task description) and `status`. With `deviceId`: device-scoped listing — thinner item shape (id/createdAt/updatedAt only, no `query`/`status`, different `orderBy` set) since that endpoint mirrors devices-api\'s task index rather than the tasks service\'s own. Response carries `deviceScoped` so callers can tell which item shape they got.',
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

    server.registerTool(
        'get_task_media',
        {
            description:
                'Fetch a task\'s captured media, chosen via `kind` (screenshot | ui_state). Omit `index` to list all available URLs for that kind; pass `index` to fetch one specific item\'s URL. URLs are short-lived signed links, not embedded blobs.',
            inputSchema: {
                kind: z.enum(TASK_MEDIA_KINDS),
                taskId: z.string(),
                index: z.number().int().nonnegative().optional(),
            },
        },
        async ({ kind, taskId, index }: { kind: TaskMediaKind; taskId: string; index?: number }) =>
            asTextResult(await ctx.backend.tasks.getTaskMedia(kind, taskId, index)),
    );
}
