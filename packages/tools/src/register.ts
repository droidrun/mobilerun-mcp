import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { type RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { type ServerNotification, type ServerRequest } from '@modelcontextprotocol/sdk/types.js';
import { BackendError } from './backend/errors.js';
import { type AuthContext, type Policy, type ToolCtx } from './ctx.js';
import { asErrorResult } from './text-result.js';
import { registerAppsTools } from './tools/apps.js';
import { registerAssistantTool } from './tools/assistant.js';
import { operationAnnotations } from './tools/operation-table.js';
import { resolveOperationAccess, TOOL_METADATA } from './tools/bundle-tools.js';
import { registerConnectTools } from './tools/connect.js';
import { registerCredentialTools, registerManageCredentialsTool } from './tools/credentials.js';
import { registerDeviceControlTools } from './tools/device-control.js';
import { registerDeviceTools } from './tools/devices.js';
import { registerFilesTools } from './tools/files.js';
import { registerMailboxesTools } from './tools/mailboxes.js';
import { registerManageFlowTool } from './tools/manage-flow.js';
import { registerMessagesTools } from './tools/messages.js';
import { registerNumbersTools } from './tools/numbers.js';
import { registerPlatformCatalogTools } from './tools/platform-catalog.js';
import { registerProxiesTools } from './tools/proxies.js';
import { registerTaskTools } from './tools/tasks.js';
import { registerWebhookTools } from './tools/webhooks.js';
import { registerWorkflowEventsTool } from './tools/workflow-events.js';
import { registerWorkflowTools } from './tools/workflows.js';

const TOOL_REGISTRATIONS = [
    registerNumbersTools,
    registerMailboxesTools,
    registerMessagesTools,
    registerFilesTools,
    registerDeviceTools,
    registerWorkflowTools,
    registerManageFlowTool,
    registerWorkflowEventsTool,
    registerWebhookTools,
    registerAssistantTool,
    registerCredentialTools,
    registerTaskTools,
    registerDeviceControlTools,
    registerAppsTools,
    registerManageCredentialsTool,
    registerProxiesTools,
    registerConnectTools,
    registerPlatformCatalogTools,
] as const;

// About 2x a generous unbounded workflow: 100 parents with 10 children each,
// 10 override params per node = 21,003 array elements/object keys. Bounded
// webhook eventTypes (100) are smaller; strings do not add elements.
export const MAX_TOOL_INPUT_ELEMENTS = 42_100;

/**
 * Explicit "everything this build knows about" policy — hosts opt into this
 * on purpose (e.g. the stdio transport, or a `full` server profile); it is
 * never the default (an unset/omitted policy is a type error, and an empty
 * one registers nothing — see enforcePolicy below).
 */
export function fullAccessPolicy(): Policy {
    return { toolAllowlist: new Set(ALL_TOOL_NAMES) };
}

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
 *   `BUNDLE_TOOLS`, if `policy.operationAllowlist` has an entry for that
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
        const wrapped = async (...args: unknown[]) => {
            const startedAt = Date.now();
            const extra = args[1] as Extra | undefined;
            const requestId = extra?.requestId !== undefined ? String(extra.requestId) : undefined;
            const input = args[0] as Record<string, unknown> | undefined;
            const resolved = resolveOperationAccess(name, input);
            const operation = resolved?.operation;

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

            if (operation !== undefined) {
                const allowedOps = ctx.policy.operationAllowlist?.get(name);
                if (
                    allowedOps &&
                    operation !== undefined &&
                    (!allowedOps.has(operation) || !allowedOps.has(resolved?.effectiveOperation ?? operation))
                ) {
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
        const resolved = resolveOperationAccess(name);
        const definition = {
            ...(def as object),
            ...(resolved?.title ? { title: resolved.title } : {}),
            ...(resolved ? { annotations: operationAnnotations(resolved.accesses, resolved.destructive) } : {}),
        };
        // @ts-expect-error — passing through the SDK's variadic registerTool signature.
        const registered = original(name, definition, wrapped);
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
    const server = new McpServer({ name: 'mobilerun', version: '0.1.0' }, {
        capabilities: { tools: {} },
        maxToolInputElements: MAX_TOOL_INPUT_ELEMENTS,
    });
    enforcePolicy(server, ctx, opts.onToolCall);
    opts.wrapRegisterTool?.(server);

    for (const register of TOOL_REGISTRATIONS) register(server, ctx);

    return server;
}

type ToolNames<Metadata extends readonly { name: string }[]> = { readonly [K in keyof Metadata]: Metadata[K]['name'] };

/** Canonical const tuple derived from static registration metadata, without constructing a server. */
export const ALL_TOOL_NAMES = Object.freeze(TOOL_METADATA.map(({ name }) => name)) as ToolNames<typeof TOOL_METADATA>;
