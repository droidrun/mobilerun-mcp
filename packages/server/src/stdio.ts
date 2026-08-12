import { buildMcpServer, createAuthContext, policyForProfile, type ToolCtx } from '@mobilerun/mcp-tools';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Mobilerun from '@mobilerun/sdk';
import { logToolCall } from './audit-log.js';
import { env } from './env.js';
import { log, sanitizeError } from './log.js';
import { createSdkBackend } from './sdk-backend/index.js';

async function main() {
    const apiKey = env.MOBILERUN_CLOUD_API_KEY;
    if (!apiKey) {
        log('error', 'missing_api_key', { message: 'MOBILERUN_CLOUD_API_KEY is required for the stdio transport.' });
        process.exit(1);
    }

    const client = new Mobilerun({ apiKey, baseURL: env.MOBILERUN_BASE_URL });
    const backend = createSdkBackend(client);
    const auth = createAuthContext({ kind: 'api_key', subject: 'api-key' });
    const ctx: ToolCtx = { backend, auth, policy: policyForProfile(env.MCP_POLICY_PROFILE) };
    const server = buildMcpServer(ctx, { onToolCall: logToolCall });

    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => {
    log('error', 'stdio_fatal', sanitizeError(err));
    process.exit(1);
});
