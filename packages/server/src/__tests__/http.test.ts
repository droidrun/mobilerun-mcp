import { describe, expect, spyOn, test } from 'bun:test';
import { Context } from 'hono';
import { app, clientIp, ipBucketKey } from '../http.js';
import { env } from '../env.js';

test.each(['middleware', 'transport'])('HTTP body size is capped by %s on both MCP routes', async (layer) => {
    const previous = env.MCP_BODY_LIMIT_BYTES;
    try {
        // The middleware captures the startup limit; a smaller value here
        // exercises the per-request transport limit independently.
        if (layer === 'transport') env.MCP_BODY_LIMIT_BYTES = 256;
        for (const path of ['/', '/mcp']) {
            const res = await app.request(path, {
                method: 'POST',
                headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer dr_sk_body_limit' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', padding: 'x'.repeat(env.MCP_BODY_LIMIT_BYTES) }),
            });
            expect(res.status).toBe(413);
        }
    } finally {
        env.MCP_BODY_LIMIT_BYTES = previous;
    }
});

describe('POST /mcp — auth error taxonomy', () => {
    test('missing credentials -> 401 with WWW-Authenticate resource_metadata pointing at MCP_RESOURCE_URL', async () => {
        const res = await app.request('/mcp', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        expect(res.status).toBe(401);
        const wwwAuth = res.headers.get('WWW-Authenticate');
        expect(wwwAuth).toBeTruthy();
        expect(wwwAuth).toContain('Bearer resource_metadata=');
        expect(wwwAuth).toContain(`${env.MCP_RESOURCE_URL}/.well-known/oauth-protected-resource`);
        const body = (await res.json()) as { error?: { message?: string } };
        expect(body.error?.message).toBeTruthy();
    });

    test('a non-dr_sk_ bearer -> 400', async () => {
        const res = await app.request('/mcp', {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer sk-not-a-mobilerun-key' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        expect(res.status).toBe(400);
    });

    test('both Authorization and x-mobilerun-cloud-api-key present -> 400', async () => {
        const res = await app.request('/mcp', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                authorization: 'Bearer dr_sk_abc123',
                'x-mobilerun-cloud-api-key': 'dr_sk_def456',
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error?: { message?: string } };
        expect(body.error?.message).toContain('not both');
    });
});

describe('/mcp — transport method surface (stateless JSON only)', () => {
    test('GET -> 405', async () => {
        const res = await app.request('/mcp', { method: 'GET' });
        expect(res.status).toBe(405);
    });

    test('DELETE -> 405', async () => {
        const res = await app.request('/mcp', { method: 'DELETE' });
        expect(res.status).toBe(405);
    });
});

describe('/ — mirrors /mcp (Traefik stripPrefix delivers requests at root)', () => {
    test('POST / -> 200, same tools/list behavior as POST /mcp', async () => {
        const res = await app.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer dr_sk_test' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { result?: { tools?: Array<{ name: string }> } };
        expect(body.result?.tools?.length).toBe(37);
    });

    test('POST / missing credentials -> 401', async () => {
        const res = await app.request('/', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        expect(res.status).toBe(401);
    });

    test('GET / -> 405', async () => {
        const res = await app.request('/', { method: 'GET' });
        expect(res.status).toBe(405);
    });

    test('DELETE / -> 405', async () => {
        const res = await app.request('/', { method: 'DELETE' });
        expect(res.status).toBe(405);
    });
});

describe('/health', () => {
    test('is not gated by auth', async () => {
        const res = await app.request('/health');
        expect(res.status).toBe(200);
    });
});

describe('IP rate-limit source', () => {
    test('client-IP headers default to an empty list — only the socket peer is trusted', () => {
        expect(env.MCP_TRUST_PROXY).toBe(false);
        expect(env.MCP_CLIENT_IP_HEADERS).toEqual([]);
    });

    test('a spoofed X-Forwarded-For does not change request handling (no Bindings.ip wired in tests, so the IP limiter is skipped, not fooled)', async () => {
        const res = await app.request('/mcp', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json, text/event-stream',
                authorization: 'Bearer dr_sk_test',
                'x-forwarded-for': `1.2.3.${Math.floor(Math.random() * 255)}`,
            },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        expect(res.status).toBe(200);
    });
});

describe('POST /mcp tools/list — default policy profile', () => {
    test('MCP_POLICY_PROFILE unset defaults to "no-commerce": create_device/terminate_device are absent from tools/list', async () => {
        expect(env.MCP_POLICY_PROFILE).toBe('no-commerce');

        const res = await app.request('/mcp', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer dr_sk_test' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
        });
        expect(res.status).toBe(200);
        const body = (await res.json()) as { result?: { tools?: Array<{ name: string }> } };
        const names = (body.result?.tools ?? []).map((t) => t.name);
        expect(names).not.toContain('create_device');
        expect(names).not.toContain('terminate_device');
        expect(names.length).toBe(37);
    });
});


test.each([{ body: [] }, { body: [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }] }])('JSON-RPC arrays are rejected', async ({ body }) => {
    for (const path of ['/', '/mcp']) {
        const res = await app.request(path, {
            method: 'POST',
            headers: { 'content-type': 'application/json', authorization: 'Bearer dr_sk_batch' },
            body: JSON.stringify(body),
        });
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'batch requests are not supported' } });
    }
});

test('configured header order accepts only single valid addresses regardless of the legacy switch', () => {
    const previous = env.MCP_CLIENT_IP_HEADERS;
    const peer = '192.0.2.1';
    const ip = (headers: Record<string, string>) => clientIp(new Context(new Request('http://localhost/mcp', { headers }), { env: { ip: peer } }));
    try {
        env.MCP_CLIENT_IP_HEADERS = ['x-mobilerun-client-ip', 'cf-connecting-ip'];
        expect(ip({ 'x-mobilerun-client-ip': '203.0.113.2', 'cf-connecting-ip': '2001:db8::1' })).toEqual({ ip: '203.0.113.2', source: 'x-mobilerun-client-ip' });
        expect(ip({ 'x-mobilerun-client-ip': 'invalid', 'cf-connecting-ip': '2001:db8::1' })).toEqual({ ip: '2001:db8::1', source: 'cf-connecting-ip' });
        expect(ip({ 'x-mobilerun-client-ip': '203.0.113.1, 203.0.113.2', 'cf-connecting-ip': '2001:db8::1' })).toEqual({ ip: '2001:db8::1', source: 'cf-connecting-ip' });
        expect(ip({ 'x-mobilerun-client-ip': '203.0.113.1, 203.0.113.2', 'cf-connecting-ip': 'invalid' })).toEqual({ ip: peer, source: 'socket' });
        expect(ip({ 'x-forwarded-for': '198.51.100.1, 203.0.113.1' })).toEqual({ ip: peer, source: 'socket' });
        expect(ip({ 'x-real-ip': '198.51.100.1' })).toEqual({ ip: peer, source: 'socket' });
        expect(ip({})).toEqual({ ip: peer, source: 'socket' });

        env.MCP_CLIENT_IP_HEADERS = ['cf-connecting-ip', 'x-mobilerun-client-ip'];
        expect(ip({ 'x-mobilerun-client-ip': '203.0.113.2', 'cf-connecting-ip': '2001:db8::1' })).toEqual({ ip: '2001:db8::1', source: 'cf-connecting-ip' });

        env.MCP_CLIENT_IP_HEADERS = ['cf-connecting-ip'];
        expect(ip({ 'x-mobilerun-client-ip': '203.0.113.2', 'cf-connecting-ip': '2001:db8::1' })).toEqual({ ip: '2001:db8::1', source: 'cf-connecting-ip' });
        expect(ip({ 'x-mobilerun-client-ip': '203.0.113.2' })).toEqual({ ip: peer, source: 'socket' });

        env.MCP_CLIENT_IP_HEADERS = [];
        expect(ip({ 'x-mobilerun-client-ip': '203.0.113.2', 'cf-connecting-ip': '203.0.113.1' })).toEqual({ ip: peer, source: 'socket' });
        expect(clientIp(new Context(new Request('http://localhost/mcp')))).toBeUndefined();
    } finally {
        env.MCP_CLIENT_IP_HEADERS = previous;
    }
});

test('IPv6 buckets share a canonical /64 while IPv4 addresses stay distinct', () => {
    expect(ipBucketKey('2001:db8::1')).toBe(ipBucketKey('2001:0DB8:0:0:ffff:ffff:ffff:ffff'));
    expect(ipBucketKey('2001:db8:0:1::1')).not.toBe(ipBucketKey('2001:db8::1'));
    expect(ipBucketKey('::ffff:192.0.2.1')).toBe(ipBucketKey('::ffff:c000:201'));
    expect(ipBucketKey('::ffff:192.0.2.1')).toBe('192.0.2.1');
    expect(ipBucketKey('::ffff:192.0.2.1')).not.toBe(ipBucketKey('::ffff:192.0.2.2'));
    expect(ipBucketKey('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(ipBucketKey('::ffff:7f00:1')).toBe('127.0.0.1');
    expect(ipBucketKey('::ffff:a00:5')).toBe('10.0.0.5');
    expect(ipBucketKey('::1')).toBe('::1');
    expect(ipBucketKey('::')).toBe('::');
    expect(ipBucketKey('0:0:0:0:0:0:0:1')).toBe('::1');
    expect(ipBucketKey('0:0:0:0:0:0:0:0')).toBe('::');
    expect(ipBucketKey('::1')).not.toBe(ipBucketKey('::2'));
    expect(ipBucketKey('::')).not.toBe(ipBucketKey('::2'));
    expect(ipBucketKey('192.0.2.1')).toBe('192.0.2.1');
    expect(ipBucketKey('192.0.2.1')).not.toBe(ipBucketKey('192.0.2.2'));
});

test('HTTP timeout returns 504 and aborts the dispatched upstream call', async () => {
    const previous = env.MCP_REQUEST_TIMEOUT_MS;
    let upstreamSignal: AbortSignal | null | undefined;
    const fetch = spyOn(globalThis, 'fetch').mockImplementation(Object.assign(async (_input: string | URL | Request, init?: RequestInit) => {
        upstreamSignal = init?.signal;
        return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
        });
    }, { preconnect: globalThis.fetch.preconnect }));
    try {
        env.MCP_REQUEST_TIMEOUT_MS = 30;
        const res = await app.request('/mcp', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer dr_sk_timeout' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'numbers', arguments: { operation: 'countries' } } }),
        });
        expect(res.status).toBe(504);
        expect(upstreamSignal?.aborted).toBe(true);
    } finally {
        env.MCP_REQUEST_TIMEOUT_MS = previous;
        fetch.mockRestore();
    }
});
