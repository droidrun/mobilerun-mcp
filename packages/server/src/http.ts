import { buildMcpServer, createAuthContext, policyForProfile, type ToolCtx } from '@mobilerun/mcp-tools';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import Mobilerun from '@mobilerun/sdk';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { timeout } from 'hono/timeout';
import { logToolCall } from './audit-log.js';
import { badRequestResponse, methodNotAllowedResponse, resolveCredential, tooManyRequestsResponse, unauthorizedResponse, type CredentialResult } from './auth.js';
import { env } from './env.js';
import { log, sanitizeError } from './log.js';
import { hashCredential, rateLimitConfigFromPerMinute, TokenBucketLimiter } from './rate-limit.js';
import { createSdkBackend } from './sdk-backend/index.js';

type Variables = { credential: CredentialResult };
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

// X-Forwarded-For/X-Real-IP are caller-
// controlled — unguarded, a client can put ANY value there, spoofing a
// fresh IP per request (bypassing the IP limiter entirely) or framing a
// victim's real IP (exhausting their bucket instead of the attacker's).
// So: only honor those headers when MCP_TRUST_PROXY=true (an operator
// asserting this deployment sits behind a proxy that overwrites, never
// appends-to, them). Otherwise the actual socket peer address — set by
// index.ts's Bun.serve fetch handler via `server.requestIP(request)`,
// never client-supplied — is the only source trusted for this bucket key.
if (!env.MCP_TRUST_PROXY) {
    log('info', 'ip_rate_limit_source', {
        message: 'MCP_TRUST_PROXY is false (default): X-Forwarded-For/X-Real-IP are ignored for IP rate limiting. ' +
            'The socket peer address is used when available; requests where it is not (e.g. no Bindings.ip wired ' +
            'by the host) skip the IP limiter and fall back to per-key limiting only — they are never lumped into ' +
            'one shared "unknown" bucket.',
    });
}

function clientIp(c: AppContext): string | undefined {
    if (env.MCP_TRUST_PROXY) {
        const forwardedFor = c.req.header('x-forwarded-for');
        const forwardedIp = forwardedFor?.split(',')[0]?.trim();
        if (forwardedIp) return forwardedIp;
        const realIp = c.req.header('x-real-ip')?.trim();
        if (realIp) return realIp;
    }
    return c.env?.ip;
}

const mcpBodyLimit = bodyLimit({
    maxSize: env.MCP_BODY_LIMIT_BYTES,
    onError: (c) => c.json({ error: { message: `Request body exceeds the ${env.MCP_BODY_LIMIT_BYTES}-byte limit.` } }, 413),
});
const mcpTimeout = timeout(
    env.MCP_REQUEST_TIMEOUT_MS,
    () => new HTTPException(504, { res: Response.json({ error: { message: 'MCP request timed out' } }, { status: 504 }) }),
);
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

    const client = new Mobilerun({ apiKey: credential.apiKey, baseURL: env.MOBILERUN_BASE_URL });
    const backend = createSdkBackend(client);
    // kind: 'api_key' — the public API itself enforces tenancy via key
    // scoping; this resource server never learns the org (see ctx.ts's
    // AuthContext doc). `subject` is deliberately generic (not the raw key)
    // — there is no per-key identity to surface without an introspection
    // endpoint (planned as part of future OAuth support — see the roadmap).
    const auth = createAuthContext({ kind: 'api_key', subject: 'api-key' });
    const ctx: ToolCtx = { backend, auth, policy: policyForProfile(env.MCP_POLICY_PROFILE) };
    const server = buildMcpServer(ctx, { onToolCall: logToolCall });

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
