import { type default as Mobilerun } from '@mobilerun/sdk';
import {
    type BuyConnectProxyParams,
    type ConnectBackend,
    type ListConnectionsOpts,
    type ListConnectProxiesOpts,
    type ListConnectUsersOpts,
    type ListCountriesOpts,
} from '@mobilerun/mcp-tools';

export function createConnectBackend(client: Mobilerun): ConnectBackend {
    return {
        async connectUpdateProxy(params) {
            return client.connect.proxies.update(params.proxyId, { name: params.name });
        },
        async connectEnsureHealthy(params) {
            return client.connect.proxies.ensureHealthy(params.proxyId);
        },
        async listCountries(opts: ListCountriesOpts) {
            return client.connect.countries.list({ type: opts.type, page: opts.page, pageSize: opts.pageSize });
        },
        async listConnectProxies(opts: ListConnectProxiesOpts) {
            return client.connect.proxies.list({ country: opts.country, page: opts.page, pageSize: opts.pageSize });
        },
        async getConnectProxy(id: string) {
            return client.connect.proxies.retrieve(id);
        },
        async buyConnectProxy(params: BuyConnectProxyParams) {
            return client.connect.proxies.buy({ country: params.country, type: params.type ?? 'residential' });
        },
        async cancelConnectProxy(id: string) {
            await client.connect.proxies.cancel(id);
        },
        async pingConnectProxy(id: string) {
            return client.connect.proxies.ping(id);
        },
        async listConnectProxyConnections(id: string, opts: ListConnectionsOpts) {
            return client.connect.proxies.listConnections(id, opts);
        },
        async listConnectUsers(opts: ListConnectUsersOpts) {
            return client.connect.users.list({ proxyId: opts.proxyId, page: opts.page, pageSize: opts.pageSize });
        },
        async getConnectUser(id: string) {
            return client.connect.users.retrieve(id);
        },
        async listConnectUserConnections(id: string, opts: ListConnectionsOpts) {
            return client.connect.users.listConnections(id, opts);
        },
    };
}
