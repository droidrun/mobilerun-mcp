// connect bundle — residential SOCKS5 proxies + bound users (distinct from
// the device-bound `proxies` tool). Operations: list_countries,
// list_proxies, get_proxy, buy_proxy, cancel_proxy, ping_proxy,
// list_connections (a proxy's connection history), list_users, get_user,
// list_user_connections (a user's connection history). User mutations
// (create_user/update_user/delete_user) are intentionally not exposed —
// not public product surface. buy_proxy/cancel_proxy are COMMERCE — each is
// its own operation value so a policy profile can deny exactly those two
// without touching reads.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

const CONNECT_OPERATIONS = [
    'list_countries',
    'list_proxies',
    'get_proxy',
    'buy_proxy',
    'cancel_proxy',
    'ping_proxy',
    'list_connections',
    'list_users',
    'get_user',
    'list_user_connections',
] as const;
const connectOperationSchema = z.enum(CONNECT_OPERATIONS);

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

type ConnectToolInput = {
    operation: z.infer<typeof connectOperationSchema>;
    proxyId?: string;
    userId?: string;
    country?: string;
    type?: 'residential';
    page?: number;
    pageSize?: number;
} & { [K in keyof typeof connectionFilterShape]?: z.infer<(typeof connectionFilterShape)[K]> };

function requireValue<T>(value: T | undefined, name: string, operation: string): T {
    if (value === undefined) throw new Error(`connect operation=${operation} requires ${name}`);
    return value;
}

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

export async function executeConnectOperation(input: ConnectToolInput, ctx: ToolCtx): Promise<unknown> {
    const { operation } = input;
    const backend = ctx.backend.connect;

    switch (operation) {
        case 'list_countries':
            return backend.listCountries({ type: input.type, page: input.page, pageSize: input.pageSize });
        case 'list_proxies':
            return backend.listConnectProxies({ country: input.country, page: input.page, pageSize: input.pageSize });
        case 'get_proxy':
            return backend.getConnectProxy(requireValue(input.proxyId, 'proxyId', operation));
        case 'buy_proxy':
            return backend.buyConnectProxy({ country: requireValue(input.country, 'country', operation), type: input.type });
        case 'cancel_proxy':
            await backend.cancelConnectProxy(requireValue(input.proxyId, 'proxyId', operation));
            return { success: true };
        case 'ping_proxy':
            return backend.pingConnectProxy(requireValue(input.proxyId, 'proxyId', operation));
        case 'list_connections':
            return backend.listConnectProxyConnections(requireValue(input.proxyId, 'proxyId', operation), connectionOpts(input));
        case 'list_users':
            return backend.listConnectUsers({ proxyId: input.proxyId, page: input.page, pageSize: input.pageSize });
        case 'get_user':
            return backend.getConnectUser(requireValue(input.userId, 'userId', operation));
        case 'list_user_connections':
            return backend.listConnectUserConnections(requireValue(input.userId, 'userId', operation), connectionOpts(input));
    }
}

export function registerConnectTools(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(CONNECT_OPERATIONS, ctx.policy.operationAllowlist?.get('connect'));

    server.registerTool(
        'connect',
        {
            description:
                "Manage droidrun-connect residential SOCKS5 proxies and their bound users (distinct from the device-bound " +
                "`proxies` tool). Operations: list_countries, list_proxies, get_proxy, buy_proxy (COMMERCE — provisions and " +
                "bills a residential proxy), cancel_proxy (COMMERCE), ping_proxy (cached latency), list_connections (a proxy's " +
                "connection history), list_users, get_user, list_user_connections (a user's connection history)." +
                allowedValuesNote(operationValues, CONNECT_OPERATIONS),
            inputSchema: {
                operation: connectOperationSchema,
                proxyId: z.string().optional(),
                userId: z.string().optional(),
                country: z
                    .string()
                    .optional()
                    .describe('ISO 3166-1 alpha-2. Required for buy_proxy; optional filter for list_proxies/list_countries.'),
                type: z.enum(['residential']).optional(),
                page: z.number().int().positive().optional(),
                pageSize: z.number().int().positive().max(100).optional(),
                ...connectionFilterShape,
            },
        },
        async (input) => asTextResult(await executeConnectOperation(input as ConnectToolInput, ctx)),
    );
}
