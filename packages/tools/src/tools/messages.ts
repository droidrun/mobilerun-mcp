import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { messagesConversationsSchema, messagesGetSchema, messagesListSchema, messagesMarkReadSchema } from '../backend/messages.js';
import { type ToolCtx } from '../ctx.js';
import { registerBundle, sdkOp } from './operation-table.js';
const MESSAGES_SHARED_FIELDS = {
    peerKey: z.string().optional().describe('Required for mark_read; canonical conversation key.'),
    messageId: z.string().optional().describe('Required for get.'),
    upToMessageId: z.string().optional().describe('Required for mark_read; inclusive cursor message id.'),
    upToOccurredAt: z.string().optional().describe('Required for mark_read; cursor timestamp paired with upToMessageId.'),
};

const MESSAGES_INTRO = 'Read and manage organization SMS conversations.';
export const MESSAGES_TABLE = [
    sdkOp('list', messagesListSchema, (ctx, params) => ctx.backend.messages.messagesList(params), 'read', {
        doc: 'Read the organization SMS inbox.',
    }),
    sdkOp('get', messagesGetSchema, (ctx, params) => ctx.backend.messages.messagesGet(params), 'read', {
        doc: 'Read one SMS.',
    }),
    sdkOp('conversations', messagesConversationsSchema, (ctx, params) => ctx.backend.messages.messagesConversations(params), 'read', {
        doc: 'List SMS conversations; use both cursor fields for the next page.',
    }),
    sdkOp('mark_read', messagesMarkReadSchema, (ctx, params) => ctx.backend.messages.messagesMarkRead(params), 'write', {
        doc: 'Mark received SMS as read through a cursor.',
    }),
] as const;

export function registerMessagesTools(server: McpServer, ctx: ToolCtx): void {
    registerBundle(server, ctx, 'messages', MESSAGES_TABLE, { intro: MESSAGES_INTRO, shared: MESSAGES_SHARED_FIELDS });
}
