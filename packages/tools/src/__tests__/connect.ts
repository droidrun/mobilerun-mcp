import { afterEach } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { Backend } from '../backend/index.js';
import { createAuthContext, type AuthContext, type Policy } from '../ctx.js';
import { policyForProfile, type PolicyProfile } from '../policies.js';
import { buildMcpServer } from '../register.js';
import { stubBackend, type StubOptions, type Call } from './backend-stub.js';

const sessions: Array<() => Promise<void>> = [];
afterEach(async () => {
    await Promise.all(sessions.splice(0).map((close) => close()));
});

/** One MCP transport and configurable backend for profile, policy and dispatch tests. */
export async function connect<Args extends boolean = false>(
    policyOrProfile: Policy | PolicyProfile = 'full',
    stubOpts: StubOptions<Args> & {
        backend?: Backend;
        auth?: AuthContext;
        serverOptions?: Parameters<typeof buildMcpServer>[1];
    } = {},
) {
    const backend = (stubOpts.backend ?? stubBackend(stubOpts)) as Backend & { calls: Args extends true ? Call[] : string[] };
    const server = buildMcpServer({
        backend,
        auth: stubOpts.auth ?? createAuthContext({ kind: 'api_key', subject: 'test-key' }),
        policy: typeof policyOrProfile === 'string' ? policyForProfile(policyOrProfile) : policyOrProfile,
    }, stubOpts.serverOptions);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
    let closed = false;
    const close = async () => {
        if (closed) return;
        closed = true;
        await client.close();
        await server.close();
    };
    sessions.push(close);
    return { client, server, backend, calls: backend.calls, close };
}
