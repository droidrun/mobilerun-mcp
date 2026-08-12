// Proxies port — see devices.ts's file header for the DTO philosophy.
// Mirrors @mobilerun/sdk's proxies.* (device-bound socks5/wireguard proxy
// configs — distinct from `connect` (connect.ts), which is droidrun-connect's
// residential SOCKS5 proxies/users; verified against the SDK's shipped
// proxies.d.ts).
export type ProxyProtocol = 'socks5' | 'wireguard';

export type ProxyConfigDto =
    | { protocol: 'socks5'; proxyId: string; name: string; host: string; port: number; user: string; password: string }
    | { protocol: 'wireguard'; proxyId: string; name: string; config: string };

export interface CreateSocks5ProxyParams {
    protocol: 'socks5';
    name: string;
    host: string;
    port: number;
    user: string;
    password: string;
}
export interface CreateWireguardProxyParams {
    protocol: 'wireguard';
    name: string;
    config: string;
}
export type CreateProxyParams = CreateSocks5ProxyParams | CreateWireguardProxyParams;
export type UpdateProxyParams = CreateProxyParams;

export interface ListProxiesOpts {
    protocol?: ProxyProtocol;
}

export interface ProxyLookupParams {
    host: string;
    port: number;
    user?: string;
    password?: string;
}
export interface ProxyLookupDto {
    ip: string;
    isMobile: boolean;
    latitude: number;
    longitude: number;
    city?: string;
    country?: string;
    countryCode?: string;
    region?: string;
    timezone?: string;
    carrier?: { mcc?: string; mnc?: string; name?: string };
}

export interface ProxyEnvelopeDto {
    data: ProxyConfigDto;
    message?: string;
    success?: true;
}
export interface ProxyListDto {
    data: ProxyConfigDto[];
}

export interface ProxiesBackend {
    listProxies(opts: ListProxiesOpts): Promise<ProxyListDto>;
    getProxy(proxyId: string): Promise<ProxyEnvelopeDto>;
    createProxy(params: CreateProxyParams): Promise<ProxyEnvelopeDto>;
    updateProxy(proxyId: string, params: UpdateProxyParams): Promise<ProxyEnvelopeDto>;
    deleteProxy(proxyId: string): Promise<ProxyEnvelopeDto>;
    lookupProxy(params: ProxyLookupParams): Promise<ProxyLookupDto>;
}
