import {
    operation,
    operationValues,
    operationInput,
    operationDescription,
    runOperation,
} from './operation-table.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { smsDirectionSchema, smsStatusSchema } from '../backend/communication.js';
import {
    messagesListSchema,
    messagesGetSchema,
    messagesConversationsSchema,
    messagesMarkReadSchema,
} from '../backend/messages.js';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const MESSAGES_SHARED_FIELDS = {
    direction: smsDirectionSchema.optional(),
    esimId: z.string().optional(),
    numberId: z.string().optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(100).optional(),
    peerKey: z.string().optional().describe('Required for mark_read; canonical conversation key.'),
    peerNumber: z.string().optional(),
    status: smsStatusSchema.optional(),
    messageId: z.string().optional().describe('Required for get.'),
    cursorLastMessageId: z.string().optional(),
    cursorLastOccurredAt: z.string().optional(),
    limit: z.number().int().positive().max(100).optional(),
    upToMessageId: z.string().optional().describe('Required for mark_read; inclusive cursor message id.'),
    upToOccurredAt: z
        .string()
        .optional()
        .describe('Required for mark_read; cursor timestamp paired with upToMessageId.'),
};

export const MESSAGES_TABLE = [
    operation({
        op: 'list',
        input: { ...messagesListSchema.partial().shape, direction: MESSAGES_SHARED_FIELDS.direction, esimId: MESSAGES_SHARED_FIELDS.esimId, numberId: MESSAGES_SHARED_FIELDS.numberId, page: MESSAGES_SHARED_FIELDS.page, pageSize: MESSAGES_SHARED_FIELDS.pageSize, peerKey: MESSAGES_SHARED_FIELDS.peerKey, peerNumber: MESSAGES_SHARED_FIELDS.peerNumber, status: MESSAGES_SHARED_FIELDS.status },
        access: 'read',
        describe: { order: 0, text: 'list: Read the organization SMS inbox. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.messages;
            return asTextResult(await backend.messagesList(messagesListSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'get',
        input: { ...messagesGetSchema.partial().shape, messageId: MESSAGES_SHARED_FIELDS.messageId },
        access: 'read',
        describe: { order: 1, text: 'get: Read one SMS. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.messages;
            return asTextResult(await backend.messagesGet(messagesGetSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'conversations',
        input: { ...messagesConversationsSchema.partial().shape, cursorLastMessageId: MESSAGES_SHARED_FIELDS.cursorLastMessageId, cursorLastOccurredAt: MESSAGES_SHARED_FIELDS.cursorLastOccurredAt, esimId: MESSAGES_SHARED_FIELDS.esimId, limit: MESSAGES_SHARED_FIELDS.limit, numberId: MESSAGES_SHARED_FIELDS.numberId },
        access: 'read',
        describe: {
            order: 2,
            text: 'conversations: List SMS conversations; use both cursor fields for the next page. ',
        },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.messages;
            return asTextResult(await backend.messagesConversations(messagesConversationsSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'mark_read',
        input: { ...messagesMarkReadSchema.partial().shape, peerKey: MESSAGES_SHARED_FIELDS.peerKey, upToMessageId: MESSAGES_SHARED_FIELDS.upToMessageId, upToOccurredAt: MESSAGES_SHARED_FIELDS.upToOccurredAt },
        access: 'write',
        describe: { order: 3, text: 'mark_read: Mark received SMS as read through a cursor.' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.messages;
            return asTextResult(await backend.messagesMarkRead(messagesMarkReadSchema.strip().parse(input)));
        },
    }),
] as const;
const MESSAGES_OPERATIONS = operationValues(MESSAGES_TABLE);
export function registerMessagesTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MESSAGES_OPERATIONS, ctx.policy.operationAllowlist?.get('messages'));
    server.registerTool(
        'messages',
        {
            description: operationDescription(MESSAGES_TABLE) + allowedValuesNote(values, MESSAGES_OPERATIONS),
            inputSchema: {
                operation: z.enum(MESSAGES_OPERATIONS),
                ...operationInput(MESSAGES_TABLE, MESSAGES_SHARED_FIELDS),
            },
        },
        async (input) => runOperation(MESSAGES_TABLE, input.operation, ctx, input),
    );
}
