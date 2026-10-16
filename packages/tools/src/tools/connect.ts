import { operation, registerBundle, requireValue, sdkOp } from './operation-table.js';
// connect bundle — residential SOCKS5 proxies + bound users (distinct from
// the device-bound `proxies` tool). Operations: list_countries,
// list_proxies, get_proxy, buy_proxy, cancel_proxy, ping_proxy,
// list_connections (a proxy's connection history), list_users, get_user,
// list_user_connections (a user's connection history). User mutations
// (create_user/update_user/delete_user) are intentionally not exposed —
// not public product surface. buy_proxy/cancel_proxy affect billing — each is
// its own operation value so a policy profile can deny exactly those two
// without touching reads.
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { connectEnsureHealthySchema, connectUpdateProxySchema } from '../backend/connect.js';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
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
    country: z.string().optional().describe('ISO 3166-1 alpha-2. Required for buy_proxy; optional filter for list_proxies/list_countries.'),
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

const CONNECT_INTRO =
    'Manage Mobilerun Connect residential SOCKS5 proxies and their bound users (distinct from the device-bound proxies tool).';
export const CONNECT_TABLE = [
    operation({
        op: 'list_countries',
        input: {
            type: CONNECT_SHARED_FIELDS.type,
            page: CONNECT_SHARED_FIELDS.page,
            pageSize: CONNECT_SHARED_FIELDS.pageSize,
        },
        access: 'read',
        doc: 'List available countries.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.connect.listCountries({
                    type: input.type,
                    page: input.page,
                    pageSize: input.pageSize,
                }),
            ),
    }),
    operation({
        op: 'list_proxies',
        input: {
            country: CONNECT_SHARED_FIELDS.country,
            page: CONNECT_SHARED_FIELDS.page,
            pageSize: CONNECT_SHARED_FIELDS.pageSize,
        },
        access: 'read',
        doc: 'List residential proxies.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.connect.listConnectProxies({
                    country: input.country,
                    page: input.page,
                    pageSize: input.pageSize,
                }),
            ),
    }),
    operation({
        op: 'get_proxy',
        input: { proxyId: CONNECT_SHARED_FIELDS.proxyId },
        access: 'read',
        doc: 'Read a residential proxy.',
        run: async (ctx, input) =>
            asTextResult(await ctx.backend.connect.getConnectProxy(requireValue(input.proxyId, 'proxyId', input.operation, 'connect'))),
    }),
    operation({
        op: 'buy_proxy',
        input: { country: CONNECT_SHARED_FIELDS.country, type: CONNECT_SHARED_FIELDS.type, clientRequestId: z.string().min(1).max(128).optional().describe('Reuse to retry safely; use a new value to deliberately repeat the purchase.') },
        access: 'commerce',
        doc: 'Provision and bill a residential proxy.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.connect.buyConnectProxy({
                    country: requireValue(input.country, 'country', input.operation, 'connect'),
                    type: input.type,
                    clientRequestId: input.clientRequestId,
                }),
            ),
    }),
    operation({
        op: 'cancel_proxy',
        input: { proxyId: CONNECT_SHARED_FIELDS.proxyId },
        access: 'commerce',
        doc: 'End a billed proxy.',
        run: async (ctx, input) => {
            await ctx.backend.connect.cancelConnectProxy(requireValue(input.proxyId, 'proxyId', input.operation, 'connect'));
            return asTextResult(await { success: true });
        },
    }),
    operation({
        op: 'ping_proxy',
        input: { proxyId: CONNECT_SHARED_FIELDS.proxyId },
        access: 'read',
        doc: 'Read cached latency.',
        run: async (ctx, input) =>
            asTextResult(await ctx.backend.connect.pingConnectProxy(requireValue(input.proxyId, 'proxyId', input.operation, 'connect'))),
    }),
    operation({
        op: 'list_connections',
        input: {
            proxyId: CONNECT_SHARED_FIELDS.proxyId,
            country: CONNECT_SHARED_FIELDS.country,
            page: CONNECT_SHARED_FIELDS.page,
            pageSize: CONNECT_SHARED_FIELDS.pageSize,
            status: CONNECT_SHARED_FIELDS.status,
            protocol: CONNECT_SHARED_FIELDS.protocol,
            provider: CONNECT_SHARED_FIELDS.provider,
            dstHost: CONNECT_SHARED_FIELDS.dstHost,
            dstPort: CONNECT_SHARED_FIELDS.dstPort,
            sessionId: CONNECT_SHARED_FIELDS.sessionId,
            startedAfter: CONNECT_SHARED_FIELDS.startedAfter,
            startedBefore: CONNECT_SHARED_FIELDS.startedBefore,
            endedAfter: CONNECT_SHARED_FIELDS.endedAfter,
            endedBefore: CONNECT_SHARED_FIELDS.endedBefore,
            order: CONNECT_SHARED_FIELDS.order,
            orderBy: CONNECT_SHARED_FIELDS.orderBy,
        },
        access: 'read',
        doc: "Read a proxy's connection history.",
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.connect.listConnectProxyConnections(
                    requireValue(input.proxyId, 'proxyId', input.operation, 'connect'),
                    connectionOpts(input),
                ),
            ),
    }),
    operation({
        op: 'list_users',
        input: {
            proxyId: CONNECT_SHARED_FIELDS.proxyId,
            page: CONNECT_SHARED_FIELDS.page,
            pageSize: CONNECT_SHARED_FIELDS.pageSize,
        },
        access: 'read',
        doc: 'List bound users.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.connect.listConnectUsers({
                    proxyId: input.proxyId,
                    page: input.page,
                    pageSize: input.pageSize,
                }),
            ),
    }),
    operation({
        op: 'get_user',
        input: { userId: CONNECT_SHARED_FIELDS.userId },
        access: 'read',
        doc: 'Read a bound user.',
        run: async (ctx, input) =>
            asTextResult(await ctx.backend.connect.getConnectUser(requireValue(input.userId, 'userId', input.operation, 'connect'))),
    }),
    operation({
        op: 'list_user_connections',
        input: {
            userId: CONNECT_SHARED_FIELDS.userId,
            country: CONNECT_SHARED_FIELDS.country,
            page: CONNECT_SHARED_FIELDS.page,
            pageSize: CONNECT_SHARED_FIELDS.pageSize,
            status: CONNECT_SHARED_FIELDS.status,
            protocol: CONNECT_SHARED_FIELDS.protocol,
            provider: CONNECT_SHARED_FIELDS.provider,
            dstHost: CONNECT_SHARED_FIELDS.dstHost,
            dstPort: CONNECT_SHARED_FIELDS.dstPort,
            sessionId: CONNECT_SHARED_FIELDS.sessionId,
            startedAfter: CONNECT_SHARED_FIELDS.startedAfter,
            startedBefore: CONNECT_SHARED_FIELDS.startedBefore,
            endedAfter: CONNECT_SHARED_FIELDS.endedAfter,
            endedBefore: CONNECT_SHARED_FIELDS.endedBefore,
            order: CONNECT_SHARED_FIELDS.order,
            orderBy: CONNECT_SHARED_FIELDS.orderBy,
        },
        access: 'read',
        doc: "Read a user's connection history.",
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.connect.listConnectUserConnections(
                    requireValue(input.userId, 'userId', input.operation, 'connect'),
                    connectionOpts(input),
                ),
            ),
    }),
    sdkOp('update_proxy', connectUpdateProxySchema, (ctx, params) => ctx.backend.connect.connectUpdateProxy(params), 'write', {
        doc: 'Update a residential proxy label.',
    }),
    sdkOp('ensure_healthy', connectEnsureHealthySchema, (ctx, params) => ctx.backend.connect.connectEnsureHealthy(params), 'write', {
        doc: 'Repair an unhealthy residential proxy.',
    }),
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
    registerBundle(server, ctx, 'connect', CONNECT_TABLE, { intro: CONNECT_INTRO, shared: CONNECT_SHARED_FIELDS });
}
