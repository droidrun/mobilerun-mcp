// Connect port — residential SOCKS5 proxies + bound
// users, distinct from device-bound `proxies` (proxies.ts). Mirrors
// @mobilerun/sdk's connect.* response shapes (verified against the SDK's
// shipped connect/*.d.ts). buy_proxy/cancel_proxy are COMMERCE — each is
// its own tool-input `operation` value so a policy profile (e.g.
// `no-commerce`) can deny them
// individually without touching the rest of this bundle; see tools/connect.ts.
import type { PageMeta } from './devices.js';

export type ConnectionStatus = 'active' | 'closed';
export type ConnectionProtocol = 'tcp' | 'udp' | 'unknown';

export interface ConnectionDto {
    sessionId: string;
    proxyId: string;
    userId: string;
    srcIp: string;
    dstHost: string;
    dstPort: number;
    protocol: ConnectionProtocol;
    country: string;
    provider: string;
    status: ConnectionStatus;
    bytesIn: number;
    bytesOut: number;
    totalBytes: number;
    durationMs: number;
    startedAt: string;
    endedAt: string;
    closeReason?: string | null;
}
export interface ConnectionListDto {
    items: ConnectionDto[];
    pagination: PageMeta;
}
export interface ListConnectionsOpts {
    status?: ConnectionStatus;
    protocol?: ConnectionProtocol;
    country?: string;
    provider?: string;
    dstHost?: string;
    dstPort?: number;
    sessionId?: string;
    startedAfter?: string;
    startedBefore?: string;
    endedAfter?: string;
    endedBefore?: string;
    order?: 'asc' | 'desc';
    orderBy?: 'startedAt' | 'endedAt' | 'bytesIn' | 'bytesOut' | 'totalBytes' | 'durationMs';
    page?: number;
    pageSize?: number;
}

export interface CountryDto {
    code: string;
    name: string;
    proxyTypes: readonly 'residential'[];
}
export interface CountryListDto {
    items: CountryDto[];
    pagination: PageMeta;
}
export interface ListCountriesOpts {
    type?: 'residential';
    page?: number;
    pageSize?: number;
}

export type ConnectProxyStatus = 'pending_payment' | 'provisioning' | 'active' | 'cancelling' | 'ended' | 'error';

/** Proxy including its password — returned only on buy/get (single-proxy reads). */
export interface ConnectProxyDto {
    id: string;
    country: string;
    createdAt: string;
    host: string;
    port: number;
    password: string;
    status: ConnectProxyStatus;
    type: 'residential';
    username: string;
    paymentUrl?: string | null;
}
/** Proxy without credentials — list projection. */
export interface ConnectProxyListItemDto {
    id: string;
    country: string;
    createdAt: string;
    host: string;
    port: number;
    status: ConnectProxyStatus;
    type: 'residential';
    username: string;
}
export interface ConnectProxyListDto {
    items: ConnectProxyListItemDto[];
    pagination: PageMeta;
}
export interface ListConnectProxiesOpts {
    country?: string;
    page?: number;
    pageSize?: number;
}
export interface BuyConnectProxyParams {
    country: string;
    type?: 'residential';
}
export interface ConnectProxyPingDto {
    proxyId: string;
    latency: {
        avgMs: number;
        minMs: number;
        maxMs: number;
        jitterMs: number;
        packetLoss: number;
        samples: number;
        target: string;
        measuredAt: string;
    } | null;
}

/** SOCKS5 user including its password — returned only on create/get (single-user reads). */
export interface ConnectUserDto {
    id: string;
    createdAt: string;
    username: string;
    password: string;
    proxyId?: string | null;
}
/** SOCKS5 user without its password. */
export interface ConnectUserListItemDto {
    id: string;
    createdAt: string;
    username: string;
    proxyId?: string | null;
}
export interface ConnectUserListDto {
    items: ConnectUserListItemDto[];
    pagination: PageMeta;
}
export interface ListConnectUsersOpts {
    proxyId?: string;
    page?: number;
    pageSize?: number;
}
export interface ConnectBackend {
    listCountries(opts: ListCountriesOpts): Promise<CountryListDto>;
    listConnectProxies(opts: ListConnectProxiesOpts): Promise<ConnectProxyListDto>;
    getConnectProxy(id: string): Promise<ConnectProxyDto>;
    buyConnectProxy(params: BuyConnectProxyParams): Promise<ConnectProxyDto>;
    cancelConnectProxy(id: string): Promise<void>;
    pingConnectProxy(id: string): Promise<ConnectProxyPingDto>;
    listConnectProxyConnections(id: string, opts: ListConnectionsOpts): Promise<ConnectionListDto>;
    listConnectUsers(opts: ListConnectUsersOpts): Promise<ConnectUserListDto>;
    getConnectUser(id: string): Promise<ConnectUserDto>;
    listConnectUserConnections(id: string, opts: ListConnectionsOpts): Promise<ConnectionListDto>;
}
