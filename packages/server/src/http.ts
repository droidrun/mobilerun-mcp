import { buildMcpServer, createAuthContext, policyForProfile, type ToolCtx } from '@mobilerun/mcp-tools';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import Mobilerun from '@mobilerun/sdk';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { isIP } from 'node:net';
import { wrapSdkToolCalls } from './sdk-backend/request-options.js';
import { logToolCall } from './audit-log.js';
import { badRequestResponse, methodNotAllowedResponse, resolveCredential, tooManyRequestsResponse, unauthorizedResponse, type CredentialResult } from './auth.js';
import { env } from './env.js';
import { log, sanitizeError } from './log.js';
import { hashCredential, rateLimitConfigFromPerMinute, TokenBucketLimiter } from './rate-limit.js';
import { createSdkBackend } from './sdk-backend/index.js';

type Variables = { credential: CredentialResult; signal: AbortSignal };
// `ip` is populated by index.ts's Bun.serve fetch handler from
// `server.requestIP(request)` (the actual socket peer address) — see
// clientIp()'s header for why this is preferred over trusting
// X-Forwarded-For/X-Real-IP by default. Hono's `app.request(...)` test
// helper never sets Bindings, so `c.env` is undefined in tests — every
// read of it below is optional-chained.
type Bindings = { ip?: string };
type AppContext = Context<{ Variables: Variables; Bindings: Bindings }>;

export const app = new Hono<{ Variables: Variables; Bindings: Bindings }>();

app.get('/health', (c) => c.json({ status: 'ok' }));

// RFC 9728 Protected Resource Metadata — advertised only when an
// authorization server is configured; 404s otherwise. Public (no
// credential required — this is discovery, not a protected route) and
// registered ahead of any auth-gated route. Discovery-only: setting
// MCP_AUTH_SERVER_URL does NOT turn on token validation (see auth.ts —
// OAuth bearers still fail exactly as before).
if (env.MCP_AUTH_SERVER_URL) {
    const resourceMetadata = {
        resource: env.MCP_RESOURCE_URL,
        authorization_servers: [env.MCP_AUTH_SERVER_URL],
        bearer_methods_supported: ['header'],
        scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    };
    const metadataHandler = (c: AppContext) => c.json(resourceMetadata);
    app.get('/.well-known/oauth-protected-resource', metadataHandler);
    app.get('/.well-known/oauth-protected-resource/mcp', metadataHandler);
}

// Stateless JSON mode only: a fresh
// server + SDK client is built per POST request from that request's Bearer
// credential, so there is no session/stream state a GET (SSE) or DELETE
// (session-terminate) request could act on. Both are explicit 405s rather
// than silently accepted-and-ignored.
//
// Also registered at `/` (in addition to `/mcp`): the in-cluster Traefik
// route strips the `/v1/mcp` prefix before forwarding, so requests arrive
// here at `/`. `/mcp` stays registered too for direct/local use.
const getNotAllowed = (c: AppContext) => methodNotAllowedResponse(c, 'GET is not supported — this server runs stateless JSON mode (POST only, no SSE stream).');
const deleteNotAllowed = (c: AppContext) => methodNotAllowedResponse(c, 'DELETE is not supported — this server runs stateless JSON mode (POST only, no sessions to terminate).');
app.get('/mcp', getNotAllowed);
app.get('/', getNotAllowed);
app.delete('/mcp', deleteNotAllowed);
app.delete('/', deleteNotAllowed);

// Baseline in-process rate limits — one bucket per
// api-key hash, one per client IP; whichever trips first wins. Deliberately
// per-process (not distributed) — see rate-limit.ts's file header.
const keyLimiter = new TokenBucketLimiter(rateLimitConfigFromPerMinute(env.MCP_RATE_LIMIT_PER_KEY_PER_MIN));
const ipLimiter = new TokenBucketLimiter(rateLimitConfigFromPerMinute(env.MCP_RATE_LIMIT_PER_IP_PER_MIN));

// Trusted proxies supply CF-Connecting-IP or append the nearest peer to XFF.
// Without proxy trust, only the socket peer identifies the client.
if (!env.MCP_TRUST_PROXY) {
    log('info', 'ip_rate_limit_source', {
        message: 'MCP_TRUST_PROXY is false (default): X-Forwarded-For/X-Real-IP are ignored for IP rate limiting. ' +
            'The socket peer address is used when available; requests where it is not (e.g. no Bindings.ip wired ' +
            'by the host) skip the IP limiter and fall back to per-key limiting only — they are never lumped into ' +
            'one shared "unknown" bucket.',
    });
}

export function clientIp(c: AppContext): string | undefined {
    if (env.MCP_TRUST_PROXY) {
        const cloudflareIp = c.req.header('cf-connecting-ip')?.trim();
        if (cloudflareIp && isIP(cloudflareIp)) return cloudflareIp;
        const forwardedIp = c.req.header('x-forwarded-for')?.split(',').at(-1)?.trim();
        if (forwardedIp && isIP(forwardedIp)) return forwardedIp;
    }
    return c.env?.ip;
}

const mcpBodyLimit = bodyLimit({
    maxSize: env.MCP_BODY_LIMIT_BYTES,
    onError: (c) => c.json({ error: { message: `Request body exceeds the ${env.MCP_BODY_LIMIT_BYTES}-byte limit.` } }, 413),
});
async function mcpTimeout(c: AppContext, next: () => Promise<void>) {
    const controller = new AbortController();
    c.set('signal', AbortSignal.any([c.req.raw.signal, controller.signal]));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            next(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => {
                    reject(new HTTPException(504, { res: Response.json({ error: { message: 'MCP request timed out' } }, { status: 504 }) }));
                    controller.abort();
                }, env.MCP_REQUEST_TIMEOUT_MS);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
async function rateLimitAndAuth(c: AppContext, next: () => Promise<void>) {
    const ip = clientIp(c);
    if (ip) {
        const ipResult = ipLimiter.consume(ip);
        if (!ipResult.allowed) return tooManyRequestsResponse(c, ipResult.retryAfterSeconds);
    }

    const credential: CredentialResult = resolveCredential(c);
    if (credential.status === 'ok') {
        const keyResult = keyLimiter.consume(hashCredential(credential.apiKey));
        if (!keyResult.allowed) return tooManyRequestsResponse(c, keyResult.retryAfterSeconds);
    }
    c.set('credential', credential);
    await next();
}

app.post('/mcp', mcpBodyLimit, mcpTimeout, rateLimitAndAuth, handleMcp);
app.post('/', mcpBodyLimit, mcpTimeout, rateLimitAndAuth, handleMcp);

// MCP Streamable HTTP, stateless JSON mode: a fresh McpServer + transport +
// @mobilerun/sdk client per request — no session/claim/repair-tool logic,
// just the public Bearer-auth surface.
async function handleMcp(c: AppContext): Promise<Response> {
    const credential = c.get('credential') ?? resolveCredential(c);
    if (credential.status === 'missing') return unauthorizedResponse(c);
    if (credential.status === 'invalid') return badRequestResponse(c, credential.message);

    // Preserve transport parsing for invalid JSON, but never dispatch a batch.
    const body: unknown = await c.req.raw.clone().json().catch(() => undefined);
    if (Array.isArray(body)) {
        return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'batch requests are not supported' } }, 400);
    }

    const client = new Mobilerun({ apiKey: credential.apiKey, baseURL: env.MOBILERUN_BASE_URL });
    const backend = createSdkBackend(client, { signal: c.get('signal') });
    // kind: 'api_key' — the public API itself enforces tenancy via key
    // scoping; this resource server never learns the org (see ctx.ts's
    // AuthContext doc). `subject` is deliberately generic (not the raw key)
    // — there is no per-key identity to surface without an introspection
    // endpoint (planned as part of future OAuth support — see the roadmap).
    const auth = createAuthContext({ kind: 'api_key', subject: 'api-key' });
    const ctx: ToolCtx = { backend, auth, policy: policyForProfile(env.MCP_POLICY_PROFILE) };
    const server = buildMcpServer(ctx, { onToolCall: logToolCall, wrapRegisterTool: wrapSdkToolCalls });

    const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
    });

    try {
        await server.connect(transport);
        return await transport.handleRequest(c.req.raw);
    } catch (err) {
        log('error', 'mcp_handle_failed', sanitizeError(err));
        return c.json({ message: 'MCP request failed' }, 500);
    } finally {
        await server.close().catch(() => {});
    }
}
