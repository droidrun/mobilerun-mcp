import { requireValue } from './op-helpers.js';
// proxies bundle — device-bound socks5/wireguard proxy configs (distinct
// from the `connect` tool's purchasable residential proxies).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

const PROXIES_OPERATIONS = ['list', 'get', 'create', 'update', 'delete'] as const;
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
};


function buildProxyParams(input: ProxiesToolInput, operation: string) {
    const protocol = requireValue(input.protocol, 'protocol', operation, 'proxies');
    if (protocol === 'socks5') {
        return {
            protocol: 'socks5' as const,
            name: requireValue(input.name, 'name', operation, 'proxies'),
            host: requireValue(input.host, 'host', operation, 'proxies'),
            port: requireValue(input.port, 'port', operation, 'proxies'),
            user: requireValue(input.user, 'user', operation, 'proxies'),
            password: requireValue(input.password, 'password', operation, 'proxies'),
        };
    }
    return {
        protocol: 'wireguard' as const,
        name: requireValue(input.name, 'name', operation, 'proxies'),
        config: requireValue(input.config, 'config', operation, 'proxies'),
    };
}

async function executeProxiesOperation(input: ProxiesToolInput, ctx: ToolCtx): Promise<unknown> {
    const { operation } = input;
    const backend = ctx.backend.proxies;

    if (operation === 'list') return backend.listProxies({ protocol: input.protocol });

    if (operation === 'create') return backend.createProxy(buildProxyParams(input, operation));

    const proxyId = requireValue(input.proxyId, 'proxyId', operation, 'proxies');

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
                'also need name), update (same shape as create), delete.' +
                allowedValuesNote(operationValues, PROXIES_OPERATIONS),
            inputSchema: {
                operation: proxiesOperationSchema,
                proxyId: z.string().optional(),
                protocol: proxyProtocolSchema.optional(),
                name: z.string().optional().describe('Required for create/update.'),
                host: z.string().optional().describe('Required for protocol=socks5 on create/update.'),
                port: z.number().int().positive().optional().describe('Required for protocol=socks5 on create/update.'),
                user: z.string().optional().describe('Required for protocol=socks5 on create/update.'),
                password: z.string().optional().describe('Required for protocol=socks5 on create/update.'),
                config: z
                    .string()
                    .optional()
                    .describe('Wireguard config text. Required for protocol=wireguard on create/update.'),
            },
        },
        async (input) => asTextResult(await executeProxiesOperation(input as ProxiesToolInput, ctx)),
    );
}
