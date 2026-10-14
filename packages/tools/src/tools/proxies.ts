import {
    operation,
    operationValues,
    operationInput,
    operationDescription,
    runOperation, registerBundle } from './operation-table.js';
import { requireValue } from './op-helpers.js';
// proxies bundle — device-bound socks5/wireguard proxy configs (distinct
// from the `connect` tool's purchasable residential proxies).
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const proxyProtocolSchema = z.enum(['socks5', 'wireguard']);
const PROXIES_SHARED_FIELDS = {
    proxyId: z.string().optional(),
    protocol: proxyProtocolSchema.optional(),
    name: z.string().optional().describe('Required for create/update.'),
    host: z.string().optional().describe('Required for protocol=socks5 on create/update.'),
    port: z.number().int().positive().optional().describe('Required for protocol=socks5 on create/update.'),
    user: z.string().optional().describe('Required for protocol=socks5 on create/update.'),
    password: z.string().optional().describe('Required for protocol=socks5 on create/update.'),
    config: z.string().optional().describe('Wireguard config text. Required for protocol=wireguard on create/update.'),
};

export const PROXIES_TABLE = [
    operation({
        op: 'list',
        input: { protocol: PROXIES_SHARED_FIELDS.protocol },
        access: 'read',
        describe: {
            order: 0,
            text: 'Manage device-bound proxy configs (socks5 or wireguard) — the outbound network path a device can be assigned. Operations: list, ',
        },
        run: async (ctx, input) => {
            const backend = ctx.backend.proxies;
            return asTextResult(await backend.listProxies({ protocol: input.protocol }));
        },
    }),
    operation({
        op: 'get',
        input: { proxyId: PROXIES_SHARED_FIELDS.proxyId },
        access: 'read',
        describe: { order: 1, text: 'get, ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.proxies;
            const proxyId = requireValue(input.proxyId, 'proxyId', operation, 'proxies');
            return asTextResult(await backend.getProxy(proxyId));
        },
    }),
    operation({
        op: 'create',
        input: { protocol: PROXIES_SHARED_FIELDS.protocol, name: PROXIES_SHARED_FIELDS.name, host: PROXIES_SHARED_FIELDS.host, port: PROXIES_SHARED_FIELDS.port, user: PROXIES_SHARED_FIELDS.user, password: PROXIES_SHARED_FIELDS.password, config: PROXIES_SHARED_FIELDS.config },
        access: 'write',
        describe: {
            order: 2,
            text: 'create (protocol + either socks5:{host,port,user,password} or wireguard:{config}, both also need name), ',
        },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.proxies;
            return asTextResult(await backend.createProxy(buildProxyParams(input, operation)));
        },
    }),
    operation({
        op: 'update',
        input: { proxyId: PROXIES_SHARED_FIELDS.proxyId, protocol: PROXIES_SHARED_FIELDS.protocol, name: PROXIES_SHARED_FIELDS.name, host: PROXIES_SHARED_FIELDS.host, port: PROXIES_SHARED_FIELDS.port, user: PROXIES_SHARED_FIELDS.user, password: PROXIES_SHARED_FIELDS.password, config: PROXIES_SHARED_FIELDS.config },
        access: 'write',
        describe: { order: 3, text: 'update (same shape as create), ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.proxies;
            const proxyId = requireValue(input.proxyId, 'proxyId', operation, 'proxies');
            return asTextResult(await backend.updateProxy(proxyId, buildProxyParams(input, operation)));
        },
    }),
    operation({
        op: 'delete',
        input: { proxyId: PROXIES_SHARED_FIELDS.proxyId },
        access: 'write',
        describe: { order: 4, text: 'delete.' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.proxies;
            const proxyId = requireValue(input.proxyId, 'proxyId', operation, 'proxies');
            return asTextResult(await backend.deleteProxy(proxyId));
        },
    }),
] as const;
type ProxiesInput = z.infer<z.ZodObject<typeof PROXIES_SHARED_FIELDS>>;


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
    
    registerBundle(server, ctx, 'proxies', PROXIES_TABLE, { shared: PROXIES_SHARED_FIELDS });
}
