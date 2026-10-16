import { AsyncLocalStorage } from 'node:async_hooks';
import Mobilerun, { type ClientOptions } from '@mobilerun/sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { canonicalJson, resolveOperationAccess } from '@mobilerun/mcp-tools';
import { stableHash } from '../rate-limit.js';

type FinalRequestOptions = Awaited<Parameters<Mobilerun['request']>[0]>;
export type BackendRequestContext = { signal?: AbortSignal };
type ToolRequest = { tool: string; operation: string; args: Record<string, unknown>; purchase: boolean; clientRequestId?: string };
const toolRequests = new AsyncLocalStorage<ToolRequest>();
const PURCHASE_WINDOW_MS = 600_000;
const READ_METHODS = new Set(['get', 'head', 'options']);
// eSIM activation downloads an existing profile; no eSIM purchase operation is exposed.
const PURCHASE_OPERATIONS = new Set(['create_device', 'numbers.create', 'mailboxes.create', 'mailboxes.restart', 'mailboxes.uncancel', 'connect.buy_proxy']);

/** The dispatched purchase header, scoped to the current tool invocation. */
export function purchaseRequestId(): string | undefined {
    return toolRequests.getStore()?.clientRequestId;
}

/** Purchase retries share a key within a bounded window, independent of JSON-RPC ids. */
function defaultIdempotencyKey(credential: string, request: ToolRequest): string {
    return stableHash(canonicalJson([
        stableHash(credential), request.tool, request.operation, request.args, Math.floor(Date.now() / PURCHASE_WINDOW_MS),
    ]));
}

/** Existing server composition hook keeps concurrent tool contexts isolated. */
export function wrapSdkToolCalls(server: McpServer): void {
    const register = server.registerTool.bind(server);
    server.registerTool = ((name: string, definition: object, handler: (...args: unknown[]) => Promise<CallToolResult>) => {
        return register(name, definition, (...args: unknown[]) => {
            const input = (args[0] ?? {}) as Record<string, unknown>;
            const resolved = resolveOperationAccess(name, input);
            const operation = resolved?.operation ?? '';
            const purchase = resolved?.access === 'commerce' && PURCHASE_OPERATIONS.has(operation ? `${name}.${operation}` : name);
            return toolRequests.run({ tool: name, operation, args: input, purchase }, () => handler(...args));
        });
    }) as typeof server.registerTool;
}

/** All adapters share SDK hooks for request options and dispatch-time cancellation. */
export class SdkClient extends Mobilerun {
    constructor(options: ClientOptions, private readonly context: BackendRequestContext = {}) {
        super(options);
    }

    // SDK 6 captures retry counts before prepareOptions, so set this option before entering the hook.
    override request<Rsp>(options: Parameters<Mobilerun['request']>[0], remainingRetries: number | null = null) {
        return super.request<Rsp>(Promise.resolve(options).then((options) => ({
            ...options,
            ...(!READ_METHODS.has(options.method) ? { maxRetries: 0 } : {}),
        })), remainingRetries);
    }

    protected override async prepareOptions(options: FinalRequestOptions): Promise<void> {
        options.signal = this.context.signal && options.signal
            ? AbortSignal.any([this.context.signal, options.signal])
            : this.context.signal ?? options.signal;
        const tool = toolRequests.getStore();
        if (READ_METHODS.has(options.method) || !tool) return;
        const explicitKey = tool.args.clientRequestId;
        if (typeof explicitKey === 'string' && explicitKey) options.idempotencyKey = explicitKey;
        else if (tool.purchase && !options.idempotencyKey) options.idempotencyKey = defaultIdempotencyKey(this.apiKey ?? '', tool);
    }

    protected override async prepareRequest(request: RequestInit, { options }: { options: FinalRequestOptions }): Promise<void> {
        if (READ_METHODS.has(options.method)) return;
        options.signal?.throwIfAborted();
        const tool = toolRequests.getStore();
        if (tool?.purchase) tool.clientRequestId = new Headers(request.headers).get('Idempotency-Key') ?? undefined;
        // Once sent, writes finish under the SDK timeout; caller cancellation cannot undo them.
        delete request.signal;
        delete options.signal;
    }
}
