import type Mobilerun from '@mobilerun/sdk';
import type { CreateProxyParams, ListProxiesOpts, ProxiesBackend, UpdateProxyParams } from '@mobilerun/mcp-tools';

export function createProxiesBackend(client: Mobilerun): ProxiesBackend {
    return {
        async listProxies(opts: ListProxiesOpts) {
            return client.proxies.list({ protocol: opts.protocol });
        },
        async getProxy(proxyId: string) {
            return client.proxies.retrieve(proxyId);
        },
        async createProxy(params: CreateProxyParams) {
            return client.proxies.create(params);
        },
        async updateProxy(proxyId: string, params: UpdateProxyParams) {
            return client.proxies.update(proxyId, params);
        },
        async deleteProxy(proxyId: string) {
            return client.proxies.delete(proxyId);
        },
    };
}
