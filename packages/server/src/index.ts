import { app } from './http.js';
import { env } from './env.js';
import { log } from './log.js';

// Codex fix pack (2026-08-12): wires Bun's actual socket peer address
// through to Hono's Bindings (`c.env.ip` in http.ts) for IP-based rate
// limiting — never trusted from a client-supplied header by default (see
// http.ts's clientIp()). `server.requestIP` returns null for some
// transports (e.g. Unix sockets); http.ts treats a missing ip as "skip the
// IP limiter, per-key limiting still applies" rather than lumping everyone
// into one shared bucket.
const server = Bun.serve({
    port: env.PORT,
    fetch: (req, srv) => app.fetch(req, { ip: srv.requestIP(req)?.address }),
});

log('info', 'server_listening', { port: server.port, policyProfile: env.MCP_POLICY_PROFILE });

function shutdown() {
    log('info', 'server_shutting_down');
    server.stop();
    process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
