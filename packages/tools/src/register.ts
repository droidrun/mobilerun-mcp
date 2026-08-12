import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ServerNotification, ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { BackendError } from './backend/errors.js';
import type { AuthContext, Policy, ToolCtx } from './ctx.js';
import { asErrorResult } from './text-result.js';
import { registerAppsTools } from './tools/apps.js';
import { registerConnectTools } from './tools/connect.js';
import { registerCredentialTools, registerManageCredentialsTool } from './tools/credentials.js';
import { registerDeviceControlTools } from './tools/device-control.js';
import { registerDeviceTools } from './tools/devices.js';
import { registerManageFlowTool } from './tools/manage-flow.js';
import { registerPlatformCatalogTools } from './tools/platform-catalog.js';
import { registerProfileTools } from './tools/profiles.js';
import { registerProxiesTools } from './tools/proxies.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerWebhookTools } from './tools/webhooks.js';
import { registerWorkflowEventsTool } from './tools/workflow-events.js';
import { registerWorkflowTools } from './tools/workflows.js';

/** Canonical list of every tool this package registers — the single source
 * of truth `fullAccessPolicy()` and the schema-snapshot test both read from. */
export const ALL_TOOL_NAMES = [
    'list_devices',
    'get_device',
    'get_device_screenshot',
    'get_device_ui_state',
    'list_apps_on_device',
    'create_device',
    'terminate_device',
    'list_workflow_resources',
    'get_workflow_resource',
    'create_action',
    'create_trigger',
    'create_flow',
    'manage_flow',
    'workflow_events',
    'webhooks',
    'list_credentials',
    'list_credential_packages',
    'run_task',
    'get_task',
    'list_tasks',
    'stop_task',
    'send_task_message',
    'get_task_media',
    // device_recordings is NOT here: no SDK support exists for it at all
    // (see ../tools/device-control.ts's header).
    'manage_device',
    'device_action',
    'manage_device_apps',
    'manage_device_files',
    'configure_device',
    'manage_esim',
    'profiles',
    'apps',
    'manage_credentials',
    'proxies',
    'connect',
    'platform_catalog',
] as const;

/**
 * Explicit "everything this build knows about" policy — hosts opt into this
 * on purpose (e.g. the stdio transport, or a `full` server profile); it is
 * never the default (an unset/omitted policy is a type error, and an empty
 * one registers nothing — see enforcePolicy below).
 */
export function fullAccessPolicy(): Policy {
    return { toolAllowlist: new Set(ALL_TOOL_NAMES) };
}

/**
 * Maps a bundle tool name to the input field carrying its operation/resource
 * enum, for `Policy.operationAllowlist` dispatch-time gating. Tools not
 * listed here have no operation-level surface (their tool-level allowlist
 * gate is the only gate).
 */
const OPERATION_FIELD: Readonly<Record<string, string>> = {
    webhooks: 'operation',
    list_workflow_resources: 'resource',
    get_workflow_resource: 'resource',
    get_task: 'view',
    get_task_media: 'kind',
    manage_device: 'operation',
    device_action: 'operation',
    manage_device_apps: 'operation',
    manage_device_files: 'operation',
    configure_device: 'operation',
    manage_esim: 'operation',
    profiles: 'operation',
    manage_flow: 'operation',
    workflow_events: 'operation',
    apps: 'operation',
    manage_credentials: 'operation',
    proxies: 'operation',
    connect: 'operation',
    platform_catalog: 'catalog',
};

export type ToolCallOutcome = 'ok' | 'error' | 'denied';

/**
 * Audit event for one tool call — deliberately narrow: no token, no raw
 * call arguments, no secrets. `auth` mirrors only the non-sensitive
 * identity fields of AuthContext.
 */
export interface ToolCallEvent {
    toolName: string;
    operation?: string;
    outcome: ToolCallOutcome;
    durationMs: number;
    requestId?: string;
    auth: {
        kind: AuthContext['kind'];
        subject: string;
        ownerId?: string;
        clientId?: string;
    };
}

function authAttrs(auth: AuthContext): ToolCallEvent['auth'] {
    return { kind: auth.kind, subject: auth.subject, ownerId: auth.ownerId, clientId: auth.clientId };
}

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * Wraps every `server.registerTool` call so `ctx.policy` applies uniformly:
 *
 * - Tool-level (fail-closed at REGISTRATION): a tool
 *   name outside `policy.toolAllowlist` is registered and then immediately
 *   `.remove()`d. The SDK's `RegisteredTool` handle can only be constructed
 *   by its own internal `_createRegisteredTool` — there is no supported way
 *   to skip registration outright and still get a valid handle back — so
 *   register-then-remove is how this package achieves the *externally
 *   observable* "never registered" contract without reimplementing SDK
 *   internals: `remove()` deletes the tool from the server's registry
 *   entirely (verified against the SDK's `mcp.js`), so it's absent from
 *   `tools/list` and a direct `tools/call` for it fails with the SDK's own
 *   "Tool X not found" protocol error — never reaching this package's
 *   handler.
 * - Operation-level (same fail-closed principle, one level deeper): for a tool present in
 *   `OPERATION_FIELD`, if `policy.operationAllowlist` has an entry for that
 *   tool name, the input field it names is checked before the real handler
 *   runs; a value outside the allowed set is rejected with a typed error
 *   result. (Tool authors additionally narrow the zod enum + description to
 *   the allowed subset where the ctx is available at registration time —
 *   see tools/webhooks.ts / tools/workflows.ts.)
 * - `BackendError`s thrown by the real handler are rendered uniformly via
 *   `asErrorResult` here, in one place, rather than requiring every tool
 *   handler to catch-and-format them individually.
 * - Every outcome (ok / error / denied) is reported to `opts.onToolCall`,
 *   if set — this package's only telemetry hook; it never logs args/tokens.
 */
function enforcePolicy(server: McpServer, ctx: ToolCtx, onToolCall?: (event: ToolCallEvent) => void): void {
    const original = server.registerTool.bind(server);
    server.registerTool = ((name: string, def: unknown, handler: (...args: unknown[]) => unknown) => {
        const opField = OPERATION_FIELD[name];
        const wrapped = async (...args: unknown[]) => {
            const startedAt = Date.now();
            const extra = args[1] as Extra | undefined;
            const requestId = extra?.requestId !== undefined ? String(extra.requestId) : undefined;
            const input = args[0] as Record<string, unknown> | undefined;
            const operation = opField && typeof input?.[opField] === 'string' ? (input[opField] as string) : undefined;

            const report = (outcome: ToolCallOutcome) => {
                onToolCall?.({
                    toolName: name,
                    operation,
                    outcome,
                    durationMs: Date.now() - startedAt,
                    requestId,
                    auth: authAttrs(ctx.auth),
                });
            };

            if (opField) {
                const allowedOps = ctx.policy.operationAllowlist?.get(name);
                if (allowedOps && operation !== undefined && !allowedOps.has(operation)) {
                    report('denied');
                    return asErrorResult(`Operation "${operation}" of tool "${name}" is not available for this credential.`);
                }
            }

            try {
                const result = await handler(...args);
                const isToolResultError = !!result && typeof result === 'object' && (result as { isError?: unknown }).isError === true;
                report(isToolResultError ? 'error' : 'ok');
                return result;
            } catch (err) {
                report('error');
                if (err instanceof BackendError) return asErrorResult(err);
                throw err;
            }
        };
        // @ts-expect-error — passing through the SDK's variadic registerTool signature.
        const registered = original(name, def, wrapped);
        if (!ctx.policy.toolAllowlist.has(name)) {
            registered.remove();
        }
        return registered;
    }) as typeof server.registerTool;
}

export type BuildMcpServerOpts = {
    /**
     * Composition hook: a host that embeds this package can wrap
     * `server.registerTool` a second time for its own concerns (metrics,
     * an additional tier-gate, etc). Runs AFTER the core policy wrap is
     * installed (so its wrapped handler still passes through the policy
     * gate first), and BEFORE any tool is registered (so it sees every
     * tool, base + caller-added).
     */
    wrapRegisterTool?: (server: McpServer) => void;
    /**
     * Audit hook: fired once per tool call with outcome + timing +
     * non-sensitive auth attrs — never token/args/secrets. The server
     * package wires this to structured console logs; a host can wire it to
     * its own observability stack instead/also.
     */
    onToolCall?: (event: ToolCallEvent) => void;
};

/**
 * Fresh McpServer per call — stateless transport, no shared state across
 * requests. Registers every tool group; `ctx.policy` is enforced
 * fail-closed at registration time (see enforcePolicy); `opts.wrapRegisterTool`
 * is the composition point for a caller's own registerTool wrapper
 * (metrics/tier-gating), and `opts.onToolCall` for audit telemetry.
 */
export function buildMcpServer(ctx: ToolCtx, opts: BuildMcpServerOpts = {}): McpServer {
    const server = new McpServer(
        { name: 'mobilerun', version: '0.1.0' },
        { capabilities: { tools: {} } },
    );
    enforcePolicy(server, ctx, opts.onToolCall);
    opts.wrapRegisterTool?.(server);

    registerDeviceTools(server, ctx);
    registerWorkflowTools(server, ctx);
    registerManageFlowTool(server, ctx);
    registerWorkflowEventsTool(server, ctx);
    registerWebhookTools(server, ctx);
    registerCredentialTools(server, ctx);
    registerTaskTools(server, ctx);
    registerDeviceControlTools(server, ctx);
    registerProfileTools(server, ctx);
    registerAppsTools(server, ctx);
    registerManageCredentialsTool(server, ctx);
    registerProxiesTools(server, ctx);
    registerConnectTools(server, ctx);
    registerPlatformCatalogTools(server, ctx);

    return server;
}
