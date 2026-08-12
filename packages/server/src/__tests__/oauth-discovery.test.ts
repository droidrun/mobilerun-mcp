import { describe, expect, test } from 'bun:test';

// env.ts parses process.env once at module load, so exercising both the
// MCP_AUTH_SERVER_URL-set and -unset cases against the SAME in-process
// `app` singleton (as http.test.ts does for everything else) isn't
// possible. Each case runs in its own `bun run` subprocess instead — see
// fixtures/oauth-discovery-probe.ts.
const PROBE_SCRIPT = new URL('./fixtures/oauth-discovery-probe.ts', import.meta.url).pathname;

async function runProbe(envOverrides: Record<string, string | undefined>) {
    const env = { ...process.env };
    for (const [key, value] of Object.entries(envOverrides)) {
        if (value === undefined) delete env[key];
        else env[key] = value;
    }
    const proc = Bun.spawn({
        cmd: [process.execPath, 'run', PROBE_SCRIPT],
        env,
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    if (exitCode !== 0) throw new Error(`probe subprocess exited ${exitCode}\nstderr: ${stderr}\nstdout: ${stdout}`);
    const lastLine = stdout.trim().split('\n').pop() ?? '';
    return JSON.parse(lastLine) as {
        wellKnownStatus: number;
        wellKnownBody: unknown;
        wellKnownMcpStatus: number;
        wellKnownMcpBody: unknown;
        unauthStatus: number;
        wwwAuthenticate: string | null;
    };
}

describe('OAuth protected-resource discovery (RFC 9728) — MCP_AUTH_SERVER_URL unset', () => {
    test('.well-known routes 404, WWW-Authenticate unchanged', async () => {
        const result = await runProbe({ MCP_AUTH_SERVER_URL: undefined, MCP_RESOURCE_URL: 'https://mcp.example.com' });
        expect(result.wellKnownStatus).toBe(404);
        expect(result.wellKnownMcpStatus).toBe(404);
        expect(result.unauthStatus).toBe(401);
        expect(result.wwwAuthenticate).toBe('Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"');
    });
});

describe('OAuth protected-resource discovery (RFC 9728) — MCP_AUTH_SERVER_URL set', () => {
    test('.well-known routes serve RFC 9728 metadata, both paths identical', async () => {
        const result = await runProbe({
            MCP_AUTH_SERVER_URL: 'https://auth.example.com',
            MCP_RESOURCE_URL: 'https://mcp.example.com/some/path',
        });
        const expectedBody = {
            resource: 'https://mcp.example.com/some/path',
            authorization_servers: ['https://auth.example.com'],
            bearer_methods_supported: ['header'],
            scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
        };
        expect(result.wellKnownStatus).toBe(200);
        expect(result.wellKnownBody).toEqual(expectedBody);
        expect(result.wellKnownMcpStatus).toBe(200);
        expect(result.wellKnownMcpBody).toEqual(expectedBody);
    });

    test('401 WWW-Authenticate resource_metadata is derived from MCP_RESOURCE_URL\'s origin, not the raw value', async () => {
        const result = await runProbe({
            MCP_AUTH_SERVER_URL: 'https://auth.example.com',
            MCP_RESOURCE_URL: 'https://mcp.example.com/some/path',
        });
        expect(result.unauthStatus).toBe(401);
        expect(result.wwwAuthenticate).toBe('Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource"');
    });
});
