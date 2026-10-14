import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
    messagesListSchema,
    messagesGetSchema,
    messagesConversationsSchema,
    messagesMarkReadSchema,
} from '../backend/messages.js';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

const OPERATIONS = ['list', 'get', 'conversations', 'mark_read'] as const;

export function registerMessagesTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(OPERATIONS, ctx.policy.operationAllowlist?.get('messages'));
    server.registerTool(
        'messages',
        {
            description:
                'list: Read the organization SMS inbox. get: Read one SMS. conversations: List SMS conversations; use both cursor fields for the next page. mark_read: Mark received SMS as read through a cursor.' +
                allowedValuesNote(values, OPERATIONS),
            inputSchema: {
                operation: z.enum(OPERATIONS),
                direction: z.union([z.literal('all'), z.literal('inbound'), z.literal('outbound')]).optional(),
                esimId: z.string().optional(),
                numberId: z.string().optional(),
                page: z.number().int().positive().optional(),
                pageSize: z.number().int().positive().max(100).optional(),
                peerKey: z.string().optional().describe('Required for mark_read; canonical conversation key.'),
                peerNumber: z.string().optional(),
                status: z
                    .union([
                        z.literal('all'),
                        z.literal('received'),
                        z.literal('queued'),
                        z.literal('claimed'),
                        z.literal('sending'),
                        z.literal('sent'),
                        z.literal('sent_unconfirmed'),
                        z.literal('delivered'),
                        z.literal('failed'),
                    ])
                    .optional(),
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
                    return asTextResult(
                        await backend.messagesList(
                            messagesListSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) =>
                                        [
                                            'direction',
                                            'esimId',
                                            'numberId',
                                            'page',
                                            'pageSize',
                                            'peerKey',
                                            'peerNumber',
                                            'status',
                                        ].includes(key),
                                    ),
                                ),
                            ),
                        ),
                    );
                case 'get':
                    return asTextResult(
                        await backend.messagesGet(
                            messagesGetSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ['messageId'].includes(key)),
                                ),
                            ),
                        ),
                    );
                case 'conversations':
                    return asTextResult(
                        await backend.messagesConversations(
                            messagesConversationsSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) =>
                                        [
                                            'cursorLastMessageId',
                                            'cursorLastOccurredAt',
                                            'esimId',
                                            'limit',
                                            'numberId',
                                        ].includes(key),
                                    ),
                                ),
                            ),
                        ),
                    );
                case 'mark_read':
                    return asTextResult(
                        await backend.messagesMarkRead(
                            messagesMarkReadSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) =>
                                        ['peerKey', 'upToMessageId', 'upToOccurredAt'].includes(key),
                                    ),
                                ),
                            ),
                        ),
                    );
            }
        },
    );
}
