import type Mobilerun from '@mobilerun/sdk';
import type { ListTasksOpts, RunTaskParams, TaskListDto, TaskMediaKind, TasksBackend } from '@mobilerun/mcp-tools';

/**
 * TasksBackend over @mobilerun/sdk's `client.tasks.*` / `client.devices.tasks.*`.
 * Every mapping verified against the SDK's shipped .d.ts (resources/tasks/tasks.d.ts,
 * resources/devices/tasks.d.ts, resources/tasks/screenshots.d.ts,
 * resources/tasks/ui-states.d.ts) — see ../../../tools/src/backend/tasks.ts's file
 * header for the two SDK-shape gaps this backend has to bridge (trajectory has no
 * upstream paging; the device-scoped task list is a thinner shape than the global one).
 */
export function createTasksBackend(client: Mobilerun): TasksBackend {
    return {
        async runTask(params: RunTaskParams) {
            return client.tasks.run({
                deviceId: params.deviceId,
                task: params.task,
                llmModel: params.llmModel,
                maxSteps: params.maxSteps,
                outputSchema: params.outputSchema,
                stealth: params.stealth,
                vision: params.vision,
                apps: params.apps,
                credentials: params.credentials,
                files: params.files,
            });
        },
        async getTaskSummary(taskId: string) {
            const { task } = await client.tasks.retrieve(taskId);
            const {
                id, deviceId, displayId, llmModel, userId, status, apps, credentials,
                files, maxSteps, outputSchema, output, message, steps, succeeded,
                creditsUsed, stealth, vision, createdAt, updatedAt, dispatchedAt,
                claimedAt, finishedAt, cancelRequestedAt, streamUrl,
            } = task;
            return {
                id, deviceId, displayId, llmModel, task: task.task, userId, status,
                apps, credentials, files, maxSteps, outputSchema, output, message,
                steps, succeeded, creditsUsed, stealth, vision, createdAt, updatedAt,
                dispatchedAt, claimedAt, finishedAt, cancelRequestedAt, streamUrl,
            };
        },
        async getTaskStatus(taskId: string) {
            return client.tasks.getStatus(taskId);
        },
        async getTaskTrajectory(taskId: string) {
            const { trajectory } = await client.tasks.getTrajectory(taskId);
            return { events: trajectory };
        },
        async listTasks(opts: ListTasksOpts): Promise<TaskListDto> {
            if (opts.deviceId) {
                const result = await client.devices.tasks.list(opts.deviceId, {
                    orderBy: opts.orderBy as 'id' | 'createdAt' | 'updatedAt' | 'assignedAt' | undefined,
                    orderByDirection: opts.orderByDirection,
                    page: opts.page,
                    pageSize: opts.pageSize,
                });
                return {
                    items: result.items?.map((item) => ({ taskId: item.taskId, createdAt: item.createdAt, updatedAt: item.updatedAt })) ?? null,
                    pagination: result.pagination,
                    deviceScoped: true,
                };
            }
            const result = await client.tasks.list({
                orderBy: opts.orderBy as 'id' | 'createdAt' | 'finishedAt' | 'status' | undefined,
                orderByDirection: opts.orderByDirection,
                page: opts.page,
                pageSize: opts.pageSize,
                query: opts.query,
                // Preserve the legacy paused filter on the wire even though the
                // 5.5 SDK type omits it. The server decides its compatibility.
                status: opts.status as NonNullable<Parameters<typeof client.tasks.list>[0]>['status'],
            });
            return {
                items: result.items,
                pagination: result.pagination,
                deviceScoped: false,
            };
        },
        async stopTask(taskId: string) {
            return client.tasks.stop(taskId);
        },
        async sendTaskMessage(taskId: string, message: string) {
            return client.tasks.sendMessage(taskId, { message });
        },
        async getTaskMedia(kind: TaskMediaKind, taskId: string, index?: number) {
            if (kind === 'screenshot') {
                if (index === undefined) return client.tasks.screenshots.list(taskId);
                return client.tasks.screenshots.retrieve(index, { task_id: taskId });
            }
            if (index === undefined) return client.tasks.uiStates.list(taskId);
            return client.tasks.uiStates.retrieve(index, { task_id: taskId });
        },
    };
}
