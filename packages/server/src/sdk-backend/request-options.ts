import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type Mobilerun from '@mobilerun/sdk';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOL_METADATA } from '@mobilerun/mcp-tools';
import { hashCredential } from '../rate-limit.js';

export type BackendRequestContext = { signal?: AbortSignal };
type ToolRequest = { tool: string; operation: string; args: Record<string, unknown>; commerce: boolean };
const toolRequests = new AsyncLocalStorage<ToolRequest>();

function canonicalJson(value: unknown): string {
    return JSON.stringify(value, (_key, item: unknown) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
            return Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
        }
        return item;
    });
}

/** Client retries with identical inputs share a key, independent of JSON-RPC ids. */
function defaultIdempotencyKey(credential: string, request: ToolRequest): string {
    return createHash('sha256').update(canonicalJson([
        hashCredential(credential), request.tool, request.operation, request.args,
    ])).digest('hex').slice(0, 32);
}

/** Existing server composition hook keeps concurrent tool contexts isolated. */
export function wrapSdkToolCalls(server: McpServer): void {
    const register = server.registerTool.bind(server);
    server.registerTool = ((name: string, definition: object, handler: (...args: unknown[]) => Promise<CallToolResult>) => {
        const metadata = TOOL_METADATA.find((tool) => tool.name === name);
        return register(name, definition, (...args: unknown[]) => {
            const input = (args[0] ?? {}) as Record<string, unknown>;
            const operation = metadata && 'field' in metadata ? String(input[metadata.field] ?? '') : '';
            const access = metadata && ('operations' in metadata
                ? metadata.operations.find(({ op }) => op === operation)?.access
                : metadata.access);
            return toolRequests.run({ tool: name, operation, args: input, commerce: access === 'commerce' }, () => handler(...args));
        });
    }) as typeof server.registerTool;
}

/** Apply options at the SDK request boundary so every adapter, including media, shares them. */
export function withRequestOptions(client: Mobilerun, context: BackendRequestContext): Mobilerun {
    const scoped = client.withOptions({});
    const request = scoped.request.bind(scoped);
    scoped.request = (options, remainingRetries) => {
        const tool = toolRequests.getStore();
        return request(Promise.resolve(options).then((options) => {
            const signal = context.signal && options.signal
                ? AbortSignal.any([context.signal, options.signal])
                : context.signal ?? options.signal;
            const mutating = !['get', 'head', 'options'].includes(options.method);
            const explicitKey = tool?.args.clientRequestId ?? tool?.args.idempotencyKey;
            return {
                ...options,
                signal,
                ...(mutating ? { maxRetries: 0 } : {}),
                ...(mutating && tool?.commerce && !options.idempotencyKey ? {
                    idempotencyKey: typeof explicitKey === 'string' && explicitKey
                        ? explicitKey
                        : defaultIdempotencyKey(scoped.apiKey ?? '', tool),
                } : {}),
            };
        }), remainingRetries);
    };
    return scoped;
}

export function idempotencyOpts(key?: string) {
    return key ? { headers: { 'Idempotency-Key': key } } : {};
}
