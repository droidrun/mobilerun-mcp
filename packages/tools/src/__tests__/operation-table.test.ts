import { expect, test } from 'bun:test';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { createAuthContext } from '../ctx.js';
import { fullAccessPolicy } from '../register.js';
import { asTextResult } from '../text-result.js';
import { operation, registerBundle } from '../tools/operation-table.js';
import { stubBackend } from './backend-stub.js';

test('bundle registration rejects conflicting definitions unless explicitly shared', async () => {
    const ctx = { backend: stubBackend(), auth: createAuthContext({ kind: 'api_key', subject: 'test' }), policy: fullAccessPolicy() };
    const cases = [
        { left: z.string(), right: z.string().optional().describe('Optional wording'), conflict: false },
        { left: z.number().min(1), right: z.number().min(2), conflict: true },
        { left: z.enum(['a', 'b']), right: z.enum(['a', 'c']), conflict: true },
        { left: z.string(), right: z.number(), conflict: true },
        { left: z.string(), right: z.number(), shared: { value: z.union([z.string(), z.number()]) }, conflict: false },
        { left: z.object({ description: z.string() }), right: z.object({ description: z.number() }), conflict: true },
        { left: z.object({ nested: z.string().describe('First') }), right: z.object({ nested: z.string().describe('Second') }), conflict: false },
    ];
    for (const { left, right, shared, conflict } of cases) {
        const server = new McpServer({ name: 'registration-test', version: '0.0.0' });
        const table = [left, right].map((value, index) => operation({
            op: `op_${index}`, input: { value }, access: 'read', doc: 'Test operation.', run: async () => asTextResult({}),
        }));
        try {
            const register = () => registerBundle(server, ctx, 'test_bundle', table, { intro: 'Test.', shared });
            if (conflict) expect(register).toThrow('Conflicting definitions for field "value"');
            else expect(register).not.toThrow();
        } finally {
            await server.close();
        }
    }
});
