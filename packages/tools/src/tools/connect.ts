import { type Operation, operationValues, selectInput, operationInput, operationDescription, runOperation, unassignedInput } from './operation-table.js';
import { requireValue } from './op-helpers.js';
// connect bundle — residential SOCKS5 proxies + bound users (distinct from
// the device-bound `proxies` tool). Operations: list_countries,
// list_proxies, get_proxy, buy_proxy, cancel_proxy, ping_proxy,
// list_connections (a proxy's connection history), list_users, get_user,
// list_user_connections (a user's connection history). User mutations
// (create_user/update_user/delete_user) are intentionally not exposed —
// not public product surface. buy_proxy/cancel_proxy affect billing — each is
// its own operation value so a policy profile can deny exactly those two
// without touching reads.
import { connectUpdateProxySchema, connectEnsureHealthySchema } from '../backend/connect.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const connectionFilterShape = {
    status: z.enum(['active', 'closed']).optional(),
    protocol: z.enum(['tcp', 'udp', 'unknown']).optional(),
    provider: z.string().optional(),
    dstHost: z.string().optional(),
    dstPort: z.number().int().optional(),
    sessionId: z.string().optional(),
    startedAfter: z.string().optional().describe('ISO 8601.'),
    startedBefore: z.string().optional().describe('ISO 8601.'),
    endedAfter: z.string().optional().describe('ISO 8601.'),
    endedBefore: z.string().optional().describe('ISO 8601.'),
    order: z.enum(['asc', 'desc']).optional(),
    orderBy: z.enum(['startedAt', 'endedAt', 'bytesIn', 'bytesOut', 'totalBytes', 'durationMs']).optional(),
} as const;
const CONNECT_INPUT_FIELDS = {
    ...connectUpdateProxySchema.partial().shape,
    ...connectEnsureHealthySchema.partial().shape,
    proxyId: z.string().optional(),
    userId: z.string().optional(),
    country: z
        .string()
        .optional()
        .describe('ISO 3166-1 alpha-2. Required for buy_proxy; optional filter for list_proxies/list_countries.'),
    type: z.enum(['residential']).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(100).optional(),
    ...connectionFilterShape
};
type CONNECT_INPUT = z.infer<z.ZodObject<typeof CONNECT_INPUT_FIELDS>> & {
    operation: string;
};
export const CONNECT_TABLE = [
    { op: "list_countries", input: selectInput(CONNECT_INPUT_FIELDS, ["type", "page", "pageSize"]), readonly: true, billed: false, describe: { "order": 0, "text": "Manage Mobilerun Connect residential SOCKS5 proxies and their bound users (distinct from the device-bound `proxies` tool). Operations: list_countries, " }, run: async (ctx, input) => {
            const backend = ctx.backend.connect;
            return backend.listCountries({ type: input.type, page: input.page, pageSize: input.pageSize });
        } },
    { op: "list_proxies", input: selectInput(CONNECT_INPUT_FIELDS, ["country", "page", "pageSize"]), readonly: true, billed: false, describe: { "order": 1, "text": "list_proxies, " }, run: async (ctx, input) => {
            const backend = ctx.backend.connect;
            return backend.listConnectProxies({ country: input.country, page: input.page, pageSize: input.pageSize });
        } },
    { op: "get_proxy", input: selectInput(CONNECT_INPUT_FIELDS, ["proxyId"]), readonly: true, billed: false, describe: { "order": 2, "text": "get_proxy, " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            return backend.getConnectProxy(requireValue(input.proxyId, 'proxyId', operation, 'connect'));
        } },
    { op: "buy_proxy", input: selectInput(CONNECT_INPUT_FIELDS, ["country", "type"]), readonly: false, billed: true, describe: { "order": 3, "text": "buy_proxy (billed — provisions and bills a residential proxy), " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            return backend.buyConnectProxy({
                country: requireValue(input.country, 'country', operation, 'connect'),
                type: input.type,
            });
        } },
    { op: "cancel_proxy", input: selectInput(CONNECT_INPUT_FIELDS, ["proxyId"]), readonly: false, billed: true, describe: { "order": 4, "text": "cancel_proxy (ends a billed proxy), " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            await backend.cancelConnectProxy(requireValue(input.proxyId, 'proxyId', operation, 'connect'));
            return { success: true };
        } },
    { op: "ping_proxy", input: selectInput(CONNECT_INPUT_FIELDS, ["proxyId"]), readonly: true, billed: false, describe: { "order": 5, "text": "ping_proxy (cached latency), " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            return backend.pingConnectProxy(requireValue(input.proxyId, 'proxyId', operation, 'connect'));
        } },
    { op: "list_connections", input: selectInput(CONNECT_INPUT_FIELDS, ["proxyId"]), readonly: true, billed: false, describe: { "order": 6, "text": "list_connections (a proxy's connection history), " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            return backend.listConnectProxyConnections(requireValue(input.proxyId, 'proxyId', operation, 'connect'), connectionOpts(input));
        } },
    { op: "list_users", input: selectInput(CONNECT_INPUT_FIELDS, ["proxyId", "page", "pageSize"]), readonly: true, billed: false, describe: { "order": 7, "text": "list_users, " }, run: async (ctx, input) => {
            const backend = ctx.backend.connect;
            return backend.listConnectUsers({ proxyId: input.proxyId, page: input.page, pageSize: input.pageSize });
        } },
    { op: "get_user", input: selectInput(CONNECT_INPUT_FIELDS, ["userId"]), readonly: true, billed: false, describe: { "order": 8, "text": "get_user, " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            return backend.getConnectUser(requireValue(input.userId, 'userId', operation, 'connect'));
        } },
    { op: "list_user_connections", input: selectInput(CONNECT_INPUT_FIELDS, ["userId"]), readonly: true, billed: false, describe: { "order": 9, "text": "list_user_connections (a user's connection history). Additional operations: " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            return backend.listConnectUserConnections(requireValue(input.userId, 'userId', operation, 'connect'), connectionOpts(input));
        } },
    { op: "update_proxy", input: selectInput(CONNECT_INPUT_FIELDS, [...Object.keys(connectUpdateProxySchema.shape)]), readonly: false, billed: false, describe: { "order": 10, "text": "update_proxy: Update a residential proxy label. " }, run: async (ctx, input) => {
            return ctx.backend.connect.connectUpdateProxy(connectUpdateProxySchema.strip().parse(input));
        } },
    { op: "ensure_healthy", input: selectInput(CONNECT_INPUT_FIELDS, [...Object.keys(connectEnsureHealthySchema.shape)]), readonly: false, billed: false, describe: { "order": 11, "text": "ensure_healthy: Repair an unhealthy residential proxy." }, run: async (ctx, input) => {
            return ctx.backend.connect.connectEnsureHealthy(connectEnsureHealthySchema.strip().parse(input));
        } },
] as const satisfies readonly Operation<CONNECT_INPUT>[];
export const CONNECT_OPERATIONS = operationValues(CONNECT_TABLE);
const connectOperationSchema = z.enum(CONNECT_OPERATIONS);
type ConnectToolInput = {
    operation: string;
    [key: string]: unknown;
    proxyId?: string;
    userId?: string;
    country?: string;
    type?: 'residential';
    page?: number;
    pageSize?: number;
} & {
    [K in keyof typeof connectionFilterShape]?: z.infer<(typeof connectionFilterShape)[K]>;
};
function connectionOpts(input: ConnectToolInput) {
    return {
        status: input.status,
        protocol: input.protocol,
        country: input.country,
        provider: input.provider,
        dstHost: input.dstHost,
        dstPort: input.dstPort,
        sessionId: input.sessionId,
        startedAfter: input.startedAfter,
        startedBefore: input.startedBefore,
        endedAfter: input.endedAfter,
        endedBefore: input.endedBefore,
        order: input.order,
        orderBy: input.orderBy,
        page: input.page,
        pageSize: input.pageSize,
    };
}
async function executeConnectOperation(input: ConnectToolInput, ctx: ToolCtx): Promise<unknown> { return runOperation(CONNECT_TABLE, input.operation, ctx, input); }
export function registerConnectTools(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(CONNECT_OPERATIONS, ctx.policy.operationAllowlist?.get('connect'));
    server.registerTool('connect', {
        description: operationDescription(CONNECT_TABLE) + allowedValuesNote(operationValues, CONNECT_OPERATIONS),
        inputSchema: { operation: z.enum(CONNECT_OPERATIONS), ...operationInput(CONNECT_TABLE, CONNECT_INPUT_FIELDS, unassignedInput(CONNECT_INPUT_FIELDS, CONNECT_TABLE)) },
    }, async (input) => asTextResult(await executeConnectOperation(input as ConnectToolInput, ctx)));
}
