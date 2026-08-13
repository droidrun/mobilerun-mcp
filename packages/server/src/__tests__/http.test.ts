import { describe, expect, test } from 'bun:test';
import { app } from '../http.js';
import { env } from '../env.js';

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
        expect(body.result?.tools?.length).toBe(32);
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
    test('MCP_TRUST_PROXY defaults false — X-Forwarded-For/X-Real-IP are not trusted for IP rate limiting', () => {
        expect(env.MCP_TRUST_PROXY).toBe(false);
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
        expect(names.length).toBe(32);
    });
});
