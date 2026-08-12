import { z } from 'zod';
import { POLICY_PROFILES } from '@mobilerun/mcp-tools';
import { log } from './log.js';

const envSchema = z.object({
    PORT: z.coerce.number().int().positive().default(8080),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    MOBILERUN_BASE_URL: z.string().url().default('https://api.mobilerun.ai/v1'),

    // Server-start policy profile: which
    // tools/operations this deployment ever registers, BEFORE any
    // per-credential scoping. Defaults to `no-commerce` — the safe default —
    // never "everything"; an operator opts into `full` explicitly.
    MCP_POLICY_PROFILE: z.enum(POLICY_PROFILES).default('no-commerce'),
    // stdio-transport fallback only — the HTTP transport always takes the key
    // from the per-request Authorization/x-mobilerun-cloud-api-key header
    // (see auth.ts), never from env.
    MOBILERUN_CLOUD_API_KEY: z.string().optional(),

    // Canonical resource identifier for RFC 9728 Protected Resource
    // Metadata — used to build the
    // WWW-Authenticate resource_metadata URL on 401s. Deliberately an env
    // var, NEVER derived from the request's Host/Forwarded headers (those
    // are attacker-controlled).
    MCP_RESOURCE_URL: z.string().url().default('http://localhost:8080'),

    // When set, this resource server advertises OAuth 2.1 protected-resource
    // discovery (RFC 9728) — the /.well-known/oauth-protected-resource*
    // routes and the WWW-Authenticate resource_metadata pointer — pointing
    // at this authorization server. Deliberately optional, no default:
    // discovery is off until an operator wires up a real AS. Setting this
    // does NOT turn on token validation — OAuth bearers still fail auth
    // exactly as before (see auth.ts's resolveCredential).
    MCP_AUTH_SERVER_URL: z.string().url().optional(),

    // Baseline limits — sane defaults, all env-tunable.
    MCP_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(1_048_576), // 1 MiB
    MCP_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

    // In-process token-bucket rate limits — capacity == burst, refill rate
    // derived as limit/60s. Separate buckets per api-key hash and per IP so
    // one dimension being generous doesn't starve the other's protection.
    MCP_RATE_LIMIT_PER_KEY_PER_MIN: z.coerce.number().int().positive().default(60),
    MCP_RATE_LIMIT_PER_IP_PER_MIN: z.coerce.number().int().positive().default(120),

    // Whether to trust X-Forwarded-For/X-Real-IP
    // for IP-based rate limiting. Defaults to false — those headers are
    // caller-controlled and, unguarded, let a single attacker spoof a fresh
    // IP per request (bypassing the IP limiter entirely) or frame a victim's
    // real IP (exhausting their bucket). Only set true when this server sits
    // behind a proxy/load balancer that overwrites (never appends-to) those
    // headers before forwarding. `z.coerce.boolean()` is NOT used here on
    // purpose — it coerces any non-empty string ("false" included) to
    // `true`, which would silently invert this flag's default.
    MCP_TRUST_PROXY: z
        .string()
        .optional()
        .transform((v) => v === 'true'),
});

function loadEnv() {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        log('error', 'invalid_environment_configuration', { fieldErrors: result.error.flatten().fieldErrors });
        process.exit(1);
    }
    return result.data;
}

export const env = loadEnv();
export type Env = typeof env;
