// proxies bundle — device-bound socks5/wireguard proxy configs (distinct
// from the `connect` tool's droidrun-connect residential proxies).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

const PROXIES_OPERATIONS = ['list', 'get', 'create', 'update', 'delete', 'lookup'] as const;
const proxiesOperationSchema = z.enum(PROXIES_OPERATIONS);
const proxyProtocolSchema = z.enum(['socks5', 'wireguard']);

type ProxiesToolInput = {
    operation: z.infer<typeof proxiesOperationSchema>;
    proxyId?: string;
    protocol?: z.infer<typeof proxyProtocolSchema>;
    name?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    config?: string;
    lookupUser?: string;
    lookupPassword?: string;
};

function requireValue<T>(value: T | undefined, name: string, operation: string): T {
    if (value === undefined) throw new Error(`proxies operation=${operation} requires ${name}`);
    return value;
}

function buildProxyParams(input: ProxiesToolInput, operation: string) {
    const protocol = requireValue(input.protocol, 'protocol', operation);
    if (protocol === 'socks5') {
        return {
            protocol: 'socks5' as const,
            name: requireValue(input.name, 'name', operation),
            host: requireValue(input.host, 'host', operation),
            port: requireValue(input.port, 'port', operation),
            user: requireValue(input.user, 'user', operation),
            password: requireValue(input.password, 'password', operation),
        };
    }
    return {
        protocol: 'wireguard' as const,
        name: requireValue(input.name, 'name', operation),
        config: requireValue(input.config, 'config', operation),
    };
}

export async function executeProxiesOperation(input: ProxiesToolInput, ctx: ToolCtx): Promise<unknown> {
    const { operation } = input;
    const backend = ctx.backend.proxies;

    if (operation === 'list') return backend.listProxies({ protocol: input.protocol });

    if (operation === 'lookup') {
        return backend.lookupProxy({
            host: requireValue(input.host, 'host', operation),
            port: requireValue(input.port, 'port', operation),
            user: input.lookupUser,
            password: input.lookupPassword,
        });
    }

    if (operation === 'create') return backend.createProxy(buildProxyParams(input, operation));

    const proxyId = requireValue(input.proxyId, 'proxyId', operation);

    if (operation === 'get') return backend.getProxy(proxyId);
    if (operation === 'update') return backend.updateProxy(proxyId, buildProxyParams(input, operation));
    return backend.deleteProxy(proxyId);
}

export function registerProxiesTools(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(PROXIES_OPERATIONS, ctx.policy.operationAllowlist?.get('proxies'));

    server.registerTool(
        'proxies',
        {
            description:
                'Manage device-bound proxy configs (socks5 or wireguard) — the outbound network path a device can be assigned. ' +
                'Operations: list, get, create (protocol + either socks5:{host,port,user,password} or wireguard:{config}, both ' +
                'also need name), update (same shape as create), delete, lookup (resolve IP/geo/carrier for a socks5 endpoint — ' +
                'does not require an existing proxy record).' +
                allowedValuesNote(operationValues, PROXIES_OPERATIONS),
            inputSchema: {
                operation: proxiesOperationSchema,
                proxyId: z.string().optional(),
                protocol: proxyProtocolSchema.optional(),
                name: z.string().optional().describe('Required for create/update.'),
                host: z.string().optional().describe('Required for protocol=socks5 on create/update, or for operation=lookup.'),
                port: z.number().int().positive().optional().describe('Required for protocol=socks5 on create/update, or for operation=lookup.'),
                user: z.string().optional().describe('Required for protocol=socks5 on create/update.'),
                password: z.string().optional().describe('Required for protocol=socks5 on create/update.'),
                config: z.string().optional().describe('Wireguard config text. Required for protocol=wireguard on create/update.'),
                lookupUser: z.string().optional().describe('Optional socks5 auth for operation=lookup.'),
                lookupPassword: z.string().optional().describe('Optional socks5 auth for operation=lookup.'),
            },
        },
        async (input) => asTextResult(await executeProxiesOperation(input as ProxiesToolInput, ctx)),
    );
}
