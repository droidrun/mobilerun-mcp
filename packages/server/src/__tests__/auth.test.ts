import { describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { resolveCredential } from '../auth.js';

// resolveCredential only needs a Hono Context wrapping a Request — build one
// via a throwaway route rather than hand-rolling a Context mock.
async function resolve(headers: Record<string, string>) {
    let captured: ReturnType<typeof resolveCredential> | undefined;
    const app = new Hono();
    app.get('/x', (c) => {
        captured = resolveCredential(c);
        return c.text('ok');
    });
    await app.request('/x', { headers });
    if (!captured) throw new Error('resolveCredential was not called');
    return captured;
}

describe('resolveCredential', () => {
    test('missing credentials', async () => {
        expect(await resolve({})).toEqual({ status: 'missing' });
    });

    test('dr_sk_-prefixed Authorization bearer is accepted', async () => {
        expect(await resolve({ authorization: 'Bearer dr_sk_abc123' })).toEqual({ status: 'ok', apiKey: 'dr_sk_abc123' });
    });

    test('dr_sk_-prefixed legacy header is accepted', async () => {
        expect(await resolve({ 'x-mobilerun-cloud-api-key': 'dr_sk_abc123' })).toEqual({ status: 'ok', apiKey: 'dr_sk_abc123' });
    });

    test('a non-dr_sk_ bearer is rejected as invalid (OAuth not yet supported)', async () => {
        const result = await resolve({ authorization: 'Bearer sk-someOtherToken' });
        expect(result.status).toBe('invalid');
        if (result.status === 'invalid') expect(result.message).toContain('OAuth 2.1 bearer tokens are not yet supported');
    });

    test('both Authorization and x-mobilerun-cloud-api-key present is rejected as invalid', async () => {
        const result = await resolve({ authorization: 'Bearer dr_sk_abc123', 'x-mobilerun-cloud-api-key': 'dr_sk_def456' });
        expect(result.status).toBe('invalid');
        if (result.status === 'invalid') expect(result.message).toContain('not both');
    });

    test('a malformed Authorization header is rejected as invalid', async () => {
        const result = await resolve({ authorization: 'Basic abc123' });
        expect(result.status).toBe('invalid');
    });
});
