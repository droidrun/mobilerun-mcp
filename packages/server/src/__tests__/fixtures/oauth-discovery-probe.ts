// Run in a fresh `bun run` subprocess (see oauth-discovery.test.ts) so that
// env.ts parses process.env as set by the parent for THIS process only —
// env.ts is a module-load-time singleton, so re-importing it in-process
// with a different process.env would not pick up a changed
// MCP_AUTH_SERVER_URL. Prints one JSON line to stdout for the parent to
// assert on.
import { app } from '../../http.js';

async function probe() {
    const wellKnown = await app.request('/.well-known/oauth-protected-resource');
    const wellKnownMcp = await app.request('/.well-known/oauth-protected-resource/mcp');
    const unauth = await app.request('/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });

    console.log(
        JSON.stringify({
            wellKnownStatus: wellKnown.status,
            wellKnownBody: wellKnown.status === 200 ? await wellKnown.json() : null,
            wellKnownMcpStatus: wellKnownMcp.status,
            wellKnownMcpBody: wellKnownMcp.status === 200 ? await wellKnownMcp.json() : null,
            unauthStatus: unauth.status,
            wwwAuthenticate: unauth.headers.get('WWW-Authenticate'),
        }),
    );
}

probe();
