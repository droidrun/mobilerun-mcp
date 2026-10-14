import {
    operation,
    sdkOp,
    operationValues,
    operationInput,
    operationDescription,
    runOperation, registerBundle } from './operation-table.js';
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
    sdkOp('list', messagesListSchema, (ctx, params) => ctx.backend.messages.messagesList(params), 'read', { describe: { order: 0, text: 'list: Read the organization SMS inbox. ' } }),
    sdkOp('get', messagesGetSchema, (ctx, params) => ctx.backend.messages.messagesGet(params), 'read', { describe: { order: 1, text: 'get: Read one SMS. ' } }),
    sdkOp('conversations', messagesConversationsSchema, (ctx, params) => ctx.backend.messages.messagesConversations(params), 'read', { describe: {
            order: 2,
            text: 'conversations: List SMS conversations; use both cursor fields for the next page. ',
        } }),
    sdkOp('mark_read', messagesMarkReadSchema, (ctx, params) => ctx.backend.messages.messagesMarkRead(params), 'write', { describe: { order: 3, text: 'mark_read: Mark received SMS as read through a cursor.' } }),
] as const;

export function registerMessagesTools(server: McpServer, ctx: ToolCtx): void {
    
    registerBundle(server, ctx, 'messages', MESSAGES_TABLE, { shared: MESSAGES_SHARED_FIELDS });
}
