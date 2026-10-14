import {
    operation,
    sdkOp,
    operationValues,
    operationInput,
    operationDescription,
    runOperation, registerBundle } from './operation-table.js';
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
const CONNECT_SHARED_FIELDS = {
    proxyId: z.string().optional(),
    userId: z.string().optional(),
    country: z
        .string()
        .optional()
        .describe('ISO 3166-1 alpha-2. Required for buy_proxy; optional filter for list_proxies/list_countries.'),
    type: z.enum(['residential']).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(100).optional(),
    status: connectionFilterShape.status,
    protocol: connectionFilterShape.protocol,
    provider: connectionFilterShape.provider,
    dstHost: connectionFilterShape.dstHost,
    dstPort: connectionFilterShape.dstPort,
    sessionId: connectionFilterShape.sessionId,
    startedAfter: connectionFilterShape.startedAfter,
    startedBefore: connectionFilterShape.startedBefore,
    endedAfter: connectionFilterShape.endedAfter,
    endedBefore: connectionFilterShape.endedBefore,
    order: connectionFilterShape.order,
    orderBy: connectionFilterShape.orderBy,
};

export const CONNECT_TABLE = [
    operation({
        op: 'list_countries',
        input: { type: CONNECT_SHARED_FIELDS.type, page: CONNECT_SHARED_FIELDS.page, pageSize: CONNECT_SHARED_FIELDS.pageSize },
        access: 'read',
        describe: {
            order: 0,
            text: 'Manage Mobilerun Connect residential SOCKS5 proxies and their bound users (distinct from the device-bound `proxies` tool). Operations: list_countries, ',
        },
        run: async (ctx, input) => {
            const backend = ctx.backend.connect;
            return asTextResult(await backend.listCountries({ type: input.type, page: input.page, pageSize: input.pageSize }));
        },
    }),
    operation({
        op: 'list_proxies',
        input: { country: CONNECT_SHARED_FIELDS.country, page: CONNECT_SHARED_FIELDS.page, pageSize: CONNECT_SHARED_FIELDS.pageSize },
        access: 'read',
        describe: { order: 1, text: 'list_proxies, ' },
        run: async (ctx, input) => {
            const backend = ctx.backend.connect;
            return asTextResult(await backend.listConnectProxies({ country: input.country, page: input.page, pageSize: input.pageSize }));
        },
    }),
    operation({
        op: 'get_proxy',
        input: { proxyId: CONNECT_SHARED_FIELDS.proxyId },
        access: 'read',
        describe: { order: 2, text: 'get_proxy, ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            return asTextResult(await backend.getConnectProxy(requireValue(input.proxyId, 'proxyId', operation, 'connect')));
        },
    }),
    operation({
        op: 'buy_proxy',
        input: { country: CONNECT_SHARED_FIELDS.country, type: CONNECT_SHARED_FIELDS.type },
        access: 'commerce',
        describe: { order: 3, text: 'buy_proxy (billed — provisions and bills a residential proxy), ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            return asTextResult(await backend.buyConnectProxy({
                country: requireValue(input.country, 'country', operation, 'connect'),
                type: input.type,
            }));
        },
    }),
    operation({
        op: 'cancel_proxy',
        input: { proxyId: CONNECT_SHARED_FIELDS.proxyId },
        access: 'commerce',
        describe: { order: 4, text: 'cancel_proxy (ends a billed proxy), ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            await backend.cancelConnectProxy(requireValue(input.proxyId, 'proxyId', operation, 'connect'));
            return asTextResult(await { success: true });
        },
    }),
    operation({
        op: 'ping_proxy',
        input: { proxyId: CONNECT_SHARED_FIELDS.proxyId },
        access: 'read',
        describe: { order: 5, text: 'ping_proxy (cached latency), ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            return asTextResult(await backend.pingConnectProxy(requireValue(input.proxyId, 'proxyId', operation, 'connect')));
        },
    }),
    operation({
        op: 'list_connections',
        input: { proxyId: CONNECT_SHARED_FIELDS.proxyId, country: CONNECT_SHARED_FIELDS.country, page: CONNECT_SHARED_FIELDS.page, pageSize: CONNECT_SHARED_FIELDS.pageSize, status: CONNECT_SHARED_FIELDS.status, protocol: CONNECT_SHARED_FIELDS.protocol, provider: CONNECT_SHARED_FIELDS.provider, dstHost: CONNECT_SHARED_FIELDS.dstHost, dstPort: CONNECT_SHARED_FIELDS.dstPort, sessionId: CONNECT_SHARED_FIELDS.sessionId, startedAfter: CONNECT_SHARED_FIELDS.startedAfter, startedBefore: CONNECT_SHARED_FIELDS.startedBefore, endedAfter: CONNECT_SHARED_FIELDS.endedAfter, endedBefore: CONNECT_SHARED_FIELDS.endedBefore, order: CONNECT_SHARED_FIELDS.order, orderBy: CONNECT_SHARED_FIELDS.orderBy },
        access: 'read',
        describe: { order: 6, text: "list_connections (a proxy's connection history), " },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            return asTextResult(await backend.listConnectProxyConnections(
                requireValue(input.proxyId, 'proxyId', operation, 'connect'),
                connectionOpts(input),
            ));
        },
    }),
    operation({
        op: 'list_users',
        input: { proxyId: CONNECT_SHARED_FIELDS.proxyId, page: CONNECT_SHARED_FIELDS.page, pageSize: CONNECT_SHARED_FIELDS.pageSize },
        access: 'read',
        describe: { order: 7, text: 'list_users, ' },
        run: async (ctx, input) => {
            const backend = ctx.backend.connect;
            return asTextResult(await backend.listConnectUsers({ proxyId: input.proxyId, page: input.page, pageSize: input.pageSize }));
        },
    }),
    operation({
        op: 'get_user',
        input: { userId: CONNECT_SHARED_FIELDS.userId },
        access: 'read',
        describe: { order: 8, text: 'get_user, ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            return asTextResult(await backend.getConnectUser(requireValue(input.userId, 'userId', operation, 'connect')));
        },
    }),
    operation({
        op: 'list_user_connections',
        input: { userId: CONNECT_SHARED_FIELDS.userId, country: CONNECT_SHARED_FIELDS.country, page: CONNECT_SHARED_FIELDS.page, pageSize: CONNECT_SHARED_FIELDS.pageSize, status: CONNECT_SHARED_FIELDS.status, protocol: CONNECT_SHARED_FIELDS.protocol, provider: CONNECT_SHARED_FIELDS.provider, dstHost: CONNECT_SHARED_FIELDS.dstHost, dstPort: CONNECT_SHARED_FIELDS.dstPort, sessionId: CONNECT_SHARED_FIELDS.sessionId, startedAfter: CONNECT_SHARED_FIELDS.startedAfter, startedBefore: CONNECT_SHARED_FIELDS.startedBefore, endedAfter: CONNECT_SHARED_FIELDS.endedAfter, endedBefore: CONNECT_SHARED_FIELDS.endedBefore, order: CONNECT_SHARED_FIELDS.order, orderBy: CONNECT_SHARED_FIELDS.orderBy },
        access: 'read',
        describe: { order: 9, text: "list_user_connections (a user's connection history). Additional operations: " },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.connect;
            return asTextResult(await backend.listConnectUserConnections(
                requireValue(input.userId, 'userId', operation, 'connect'),
                connectionOpts(input),
            ));
        },
    }),
    sdkOp('update_proxy', connectUpdateProxySchema, (ctx, params) => ctx.backend.connect.connectUpdateProxy(params), 'write', { describe: { order: 10, text: 'update_proxy: Update a residential proxy label. ' } }),
    sdkOp('ensure_healthy', connectEnsureHealthySchema, (ctx, params) => ctx.backend.connect.connectEnsureHealthy(params), 'write', { describe: { order: 11, text: 'ensure_healthy: Repair an unhealthy residential proxy.' } }),
] as const;
type ConnectInput = z.infer<z.ZodObject<typeof CONNECT_SHARED_FIELDS>>;


function connectionOpts(input: ConnectInput) {
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

export function registerConnectTools(server: McpServer, ctx: ToolCtx): void {
    
    registerBundle(server, ctx, 'connect', CONNECT_TABLE, { shared: CONNECT_SHARED_FIELDS });
}
