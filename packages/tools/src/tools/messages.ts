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

export const MESSAGES_OPERATIONS = ['list', 'get', 'conversations', 'mark_read'] as const;

export function registerMessagesTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MESSAGES_OPERATIONS, ctx.policy.operationAllowlist?.get('messages'));
    server.registerTool(
        'messages',
        {
            description:
                'list: Read the organization SMS inbox. get: Read one SMS. conversations: List SMS conversations; use both cursor fields for the next page. mark_read: Mark received SMS as read through a cursor.' +
                allowedValuesNote(values, MESSAGES_OPERATIONS),
            inputSchema: {
                operation: z.enum(MESSAGES_OPERATIONS),
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
            },
        },
        async ({ operation, ...input }) => {
            const backend = ctx.backend.messages;
            switch (operation) {
                case 'list':
                    return asTextResult(await backend.messagesList(messagesListSchema.strip().parse(input)));
                case 'get':
                    return asTextResult(await backend.messagesGet(messagesGetSchema.strip().parse(input)));
                case 'conversations':
                    return asTextResult(
                        await backend.messagesConversations(messagesConversationsSchema.strip().parse(input)),
                    );
                case 'mark_read':
                    return asTextResult(await backend.messagesMarkRead(messagesMarkReadSchema.strip().parse(input)));
            }
        },
    );
}
