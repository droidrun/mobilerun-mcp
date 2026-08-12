import type { Context } from 'hono';
import { env } from './env.js';

const API_KEY_PREFIX = 'dr_sk_';

export type CredentialResult =
    | { status: 'ok'; apiKey: string }
    | { status: 'missing' }
    | { status: 'invalid'; message: string };

/**
 * Bearer channel separation:
 * `dr_sk_`-prefixed credential (via `Authorization: Bearer <key>` or the
 * legacy `x-mobilerun-cloud-api-key` header) ⇒ the API-key path. Any other
 * bearer value ⇒ rejected as `invalid` — OAuth 2.1 bearer tokens are not
 * yet supported by this resource server (see the roadmap). Both
 * headers present simultaneously ⇒ rejected as `invalid` (no
 * "Authorization wins" precedence — an ambiguous credential is a client
 * bug, not something to silently resolve).
 */
export function resolveCredential(c: Context): CredentialResult {
    const authHeader = c.req.header('authorization') ?? c.req.header('Authorization');
    const legacyHeader = c.req.header('x-mobilerun-cloud-api-key');

    let bearer: string | null = null;
    if (authHeader) {
        const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
        if (!match?.[1]?.trim()) {
            return { status: 'invalid', message: 'Malformed "Authorization" header — expected "Bearer <token>".' };
        }
        bearer = match[1].trim();
    }

    if (bearer !== null && legacyHeader) {
        return {
            status: 'invalid',
            message: 'Provide credentials via either "Authorization" or "x-mobilerun-cloud-api-key", not both.',
        };
    }

    const credential = bearer ?? (legacyHeader ? legacyHeader.trim() : null);
    if (!credential) return { status: 'missing' };

    if (!credential.startsWith(API_KEY_PREFIX)) {
        return {
            status: 'invalid',
            message:
                'Bearer token is not a recognized Mobilerun API key ("dr_sk_..."); OAuth 2.1 bearer tokens are not yet supported on this server.',
        };
    }

    return { status: 'ok', apiKey: credential };
}

/**
 * 401 for a missing credential, per RFC 9728 / the MCP Authorization spec:
 * `WWW-Authenticate: Bearer
 * resource_metadata="<base>/.well-known/oauth-protected-resource"` —
 * `<base>` comes from config, NEVER from the request's Host/Forwarded
 * headers (attacker-controlled). When MCP_AUTH_SERVER_URL is set (discovery
 * advertised, see http.ts), `<base>` is MCP_RESOURCE_URL's origin — the
 * well-known path always hangs off the origin, per the MCP Authorization
 * Server Location convention, regardless of any path component
 * MCP_RESOURCE_URL carries. When unset, `<base>` is MCP_RESOURCE_URL as-is
 * (unchanged from before discovery existed).
 */
export function unauthorizedResponse(c: Context): Response {
    const resourceMetadataBase = env.MCP_AUTH_SERVER_URL ? new URL(env.MCP_RESOURCE_URL).origin : env.MCP_RESOURCE_URL;
    const resourceMetadataUrl = `${resourceMetadataBase}/.well-known/oauth-protected-resource`;
    c.header('WWW-Authenticate', `Bearer resource_metadata="${resourceMetadataUrl}"`);
    return c.json(
        {
            error: {
                message: 'Missing credentials. Provide "Authorization: Bearer <dr_sk_ key>" or "x-mobilerun-cloud-api-key".',
            },
        },
        401,
    );
}

/** 400 for a malformed/ambiguous/unsupported credential. */
export function badRequestResponse(c: Context, message: string): Response {
    return c.json({ error: { message } }, 400);
}

export function methodNotAllowedResponse(c: Context, message: string): Response {
    return c.json({ error: { message } }, 405);
}

export function tooManyRequestsResponse(c: Context, retryAfterSeconds: number): Response {
    c.header('Retry-After', String(retryAfterSeconds));
    return c.json({ error: { message: 'Rate limit exceeded. Retry after the interval in the Retry-After header.' } }, 429);
}
