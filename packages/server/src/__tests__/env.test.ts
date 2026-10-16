import { describe, expect, test } from 'bun:test';

// Match the discovery tests: isolate env.ts's startup parsing in subprocesses.
async function parseEnv(headers: string | undefined, trustProxy?: string) {
    const env = { ...process.env };
    delete env.MCP_CLIENT_IP_HEADERS;
    delete env.MCP_TRUST_PROXY;
    if (headers !== undefined) env.MCP_CLIENT_IP_HEADERS = headers;
    if (trustProxy !== undefined) env.MCP_TRUST_PROXY = trustProxy;
    const moduleUrl = new URL('../env.ts', import.meta.url).href;
    const proc = Bun.spawn({
        cmd: [process.execPath, '--eval', `import { env } from ${JSON.stringify(moduleUrl)}; console.log(JSON.stringify({ headers: env.MCP_CLIENT_IP_HEADERS, trustProxy: env.MCP_TRUST_PROXY }));`],
        env,
        stdout: 'pipe',
        stderr: 'pipe',
    });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    return { stdout, stderr, exitCode };
}

describe('client-IP header configuration', () => {
    test.each([undefined, '', '   '])('defaults to socket only for %j', async (headers) => {
        const result = await parseEnv(headers);
        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({ headers: [], trustProxy: false });
    });

    test.each([undefined, 'false', 'true'])('normalizes and deduplicates the ordered list with legacy switch %j', async (trustProxy) => {
        const result = await parseEnv(' CF-Connecting-IP , X-Mobilerun-Client-Ip,cf-connecting-ip ', trustProxy);
        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual({ headers: ['cf-connecting-ip', 'x-mobilerun-client-ip'], trustProxy: trustProxy === 'true' });
    });

    test.each(['bad_name', 'x header', 'x.header', 'x/ip', 'x-ip,', ',x-ip', 'x-ip,,cf-connecting-ip', 'a,b,c,d,e,f'])('rejects malformed or excessive header names: %s', async (headers) => {
        const result = await parseEnv(headers);
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('invalid_environment_configuration');
        expect(result.stderr).toContain('MCP_CLIENT_IP_HEADERS');
    });

    test('allows five distinct headers', async () => {
        const result = await parseEnv('a,b,c,d,e');
        expect(result.exitCode).toBe(0);
        expect(JSON.parse(result.stdout).headers).toEqual(['a', 'b', 'c', 'd', 'e']);
    });

    test.each([undefined, '', '   '])('fails startup with legacy trust enabled and no list: %j', async (headers) => {
        const result = await parseEnv(headers, 'true');
        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('set MCP_CLIENT_IP_HEADERS to the headers your proxy overwrites');
    });
});
