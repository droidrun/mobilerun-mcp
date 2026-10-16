import { expect, jest, spyOn, test } from 'bun:test';
import { env } from '../env.js';

test('client_ip_sources logs bounded counts every five minutes, skips empty windows and never includes IPs', async () => {
    const previous = env.MCP_CLIENT_IP_HEADERS;
    const stderr = spyOn(console, 'error').mockImplementation(() => {});
    jest.useFakeTimers();
    try {
        env.MCP_CLIENT_IP_HEADERS = ['x-mobilerun-client-ip', 'cf-connecting-ip'];
        // Reload the singleton so its interval is installed under fake timers,
        // even if http.test.ts has already imported it (Bun shares this cache).
        delete require.cache[require.resolve('../http.js')];
        const { app } = await import('../http.js');
        const aggregates = () => stderr.mock.calls.map(([line]) => JSON.parse(String(line))).filter((line) => line.msg === 'client_ip_sources');
        expect(JSON.parse(String(stderr.mock.calls[0]?.[0]))).toMatchObject({
            msg: 'ip_rate_limit_source',
            headers: ['x-mobilerun-client-ip', 'cf-connecting-ip'],
        });

        expect((await app.request('/health')).status).toBe(200);
        jest.advanceTimersByTime(300_000);
        expect(aggregates()).toEqual([]);

        const send = (headers: Record<string, string> = {}, peer?: string, path = '/mcp') => app.request(path, { method: 'POST', headers }, { ip: peer });
        expect((await send({ 'x-mobilerun-client-ip': '203.0.113.8', 'cf-connecting-ip': '198.51.100.8' })).status).toBe(401);
        expect((await send({ 'x-mobilerun-client-ip': '2001:db8::8' }, undefined, '/')).status).toBe(401);
        expect((await send({ 'x-mobilerun-client-ip': 'invalid', 'cf-connecting-ip': '198.51.100.8' })).status).toBe(401);
        expect((await send({ 'cf-connecting-ip': '198.51.100.8, 198.51.100.9' }, '192.0.2.8')).status).toBe(401);
        expect((await send()).status).toBe(401);

        jest.advanceTimersByTime(299_999);
        expect(aggregates()).toEqual([]);
        jest.advanceTimersByTime(1);
        expect(aggregates()).toEqual([{
            level: 'info',
            msg: 'client_ip_sources',
            ts: expect.any(String),
            window_seconds: 300,
            counts: { 'x-mobilerun-client-ip': 2, 'cf-connecting-ip': 1, socket: 1, none: 1 },
        }]);

        jest.advanceTimersByTime(300_000);
        expect(aggregates()).toHaveLength(1);

        // Bucket churn and rejected requests still produce only one count log.
        for (let i = 1; i <= 50; i++) {
            expect((await send({}, `192.0.2.${i}`)).status).toBe(401);
        }
        for (let i = 0; i < env.MCP_RATE_LIMIT_PER_IP_PER_MIN; i++) {
            await send({}, '192.0.2.250');
        }
        expect((await send({}, '192.0.2.250')).status).toBe(429);
        expect(aggregates()).toHaveLength(1);
        jest.advanceTimersByTime(300_000);
        expect(aggregates()).toHaveLength(2);
        expect(aggregates()[1].counts).toEqual({ socket: 51 + env.MCP_RATE_LIMIT_PER_IP_PER_MIN });

        const output = JSON.stringify(stderr.mock.calls);
        for (const ip of ['203.0.113.8', '198.51.100.8', '198.51.100.9', '2001:db8::8', '192.0.2.']) {
            expect(output).not.toContain(ip);
        }
        expect(stderr.mock.calls).toHaveLength(3); // startup plus two aggregate lines
    } finally {
        env.MCP_CLIENT_IP_HEADERS = previous;
        jest.clearAllTimers();
        jest.useRealTimers();
        stderr.mockRestore();
    }
});
