import {
    type Operation,
    operationValues,
    selectInput,
    operationInput,
    operationDescription,
    runOperation,
} from './operation-table.js';
import { requireValue } from './op-helpers.js';
// proxies bundle — device-bound socks5/wireguard proxy configs (distinct
// from the `connect` tool's purchasable residential proxies).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const proxyProtocolSchema = z.enum(['socks5', 'wireguard']);
const PROXIES_INPUT_FIELDS = {
    proxyId: z.string().optional(),
    protocol: proxyProtocolSchema.optional(),
    name: z.string().optional().describe('Required for create/update.'),
    host: z.string().optional().describe('Required for protocol=socks5 on create/update.'),
    port: z.number().int().positive().optional().describe('Required for protocol=socks5 on create/update.'),
    user: z.string().optional().describe('Required for protocol=socks5 on create/update.'),
    password: z.string().optional().describe('Required for protocol=socks5 on create/update.'),
    config: z.string().optional().describe('Wireguard config text. Required for protocol=wireguard on create/update.'),
};
type ProxiesInput = z.infer<z.ZodObject<typeof PROXIES_INPUT_FIELDS>> & {
    operation: string;
};
export const PROXIES_TABLE = [
    {
        op: 'list',
        input: selectInput(PROXIES_INPUT_FIELDS, ['protocol']),
        access: 'read',
        describe: {
            order: 0,
            text: 'Manage device-bound proxy configs (socks5 or wireguard) — the outbound network path a device can be assigned. Operations: list, ',
        },
        run: async (ctx, input) => {
            const backend = ctx.backend.proxies;
            return backend.listProxies({ protocol: input.protocol });
        },
    },
    {
        op: 'get',
        input: selectInput(PROXIES_INPUT_FIELDS, ['proxyId']),
        access: 'read',
        describe: { order: 1, text: 'get, ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.proxies;
            const proxyId = requireValue(input.proxyId, 'proxyId', operation, 'proxies');
            return backend.getProxy(proxyId);
        },
    },
    {
        op: 'create',
        input: selectInput(PROXIES_INPUT_FIELDS, ['protocol', 'name', 'host', 'port', 'user', 'password', 'config']),
        access: 'write',
        describe: {
            order: 2,
            text: 'create (protocol + either socks5:{host,port,user,password} or wireguard:{config}, both also need name), ',
        },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.proxies;
            return backend.createProxy(buildProxyParams(input, operation));
        },
    },
    {
        op: 'update',
        input: selectInput(PROXIES_INPUT_FIELDS, [
            'proxyId',
            'protocol',
            'name',
            'host',
            'port',
            'user',
            'password',
            'config',
        ]),
        access: 'write',
        describe: { order: 3, text: 'update (same shape as create), ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.proxies;
            const proxyId = requireValue(input.proxyId, 'proxyId', operation, 'proxies');
            return backend.updateProxy(proxyId, buildProxyParams(input, operation));
        },
    },
    {
        op: 'delete',
        input: selectInput(PROXIES_INPUT_FIELDS, ['proxyId']),
        access: 'write',
        describe: { order: 4, text: 'delete.' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.proxies;
            const proxyId = requireValue(input.proxyId, 'proxyId', operation, 'proxies');
            return backend.deleteProxy(proxyId);
        },
    },
] as const satisfies readonly Operation<ProxiesInput>[];
const PROXIES_OPERATIONS = operationValues(PROXIES_TABLE);

function buildProxyParams(input: ProxiesInput, operation: string) {
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

export function registerProxiesTools(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(PROXIES_OPERATIONS, ctx.policy.operationAllowlist?.get('proxies'));
    server.registerTool(
        'proxies',
        {
            description: operationDescription(PROXIES_TABLE) + allowedValuesNote(operationValues, PROXIES_OPERATIONS),
            inputSchema: {
                operation: z.enum(PROXIES_OPERATIONS),
                ...operationInput(PROXIES_TABLE, PROXIES_INPUT_FIELDS),
            },
        },
        async (input) => asTextResult(await runOperation(PROXIES_TABLE, input.operation, ctx, input)),
    );
}
