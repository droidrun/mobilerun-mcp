import {
    type Operation,
    operationValues,
    selectInput,
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
const MESSAGES_INPUT_FIELDS = {
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
type MessagesInput = z.infer<z.ZodObject<typeof MESSAGES_INPUT_FIELDS>> & {
    operation: string;
};
export const MESSAGES_TABLE = [
    {
        op: 'list',
        input: selectInput(MESSAGES_INPUT_FIELDS, [...Object.keys(messagesListSchema.shape)]),
        access: 'read',
        describe: { order: 0, text: 'list: Read the organization SMS inbox. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.messages;
            return asTextResult(await backend.messagesList(messagesListSchema.strip().parse(input)));
        },
    },
    {
        op: 'get',
        input: selectInput(MESSAGES_INPUT_FIELDS, [...Object.keys(messagesGetSchema.shape)]),
        access: 'read',
        describe: { order: 1, text: 'get: Read one SMS. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.messages;
            return asTextResult(await backend.messagesGet(messagesGetSchema.strip().parse(input)));
        },
    },
    {
        op: 'conversations',
        input: selectInput(MESSAGES_INPUT_FIELDS, [...Object.keys(messagesConversationsSchema.shape)]),
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
    },
    {
        op: 'mark_read',
        input: selectInput(MESSAGES_INPUT_FIELDS, [...Object.keys(messagesMarkReadSchema.shape)]),
        access: 'write',
        describe: { order: 3, text: 'mark_read: Mark received SMS as read through a cursor.' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.messages;
            return asTextResult(await backend.messagesMarkRead(messagesMarkReadSchema.strip().parse(input)));
        },
    },
] as const satisfies readonly Operation<MessagesInput>[];
const MESSAGES_OPERATIONS = operationValues(MESSAGES_TABLE);
export function registerMessagesTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MESSAGES_OPERATIONS, ctx.policy.operationAllowlist?.get('messages'));
    server.registerTool(
        'messages',
        {
            description: operationDescription(MESSAGES_TABLE) + allowedValuesNote(values, MESSAGES_OPERATIONS),
            inputSchema: {
                operation: z.enum(MESSAGES_OPERATIONS),
                ...operationInput(MESSAGES_TABLE, MESSAGES_INPUT_FIELDS),
            },
        },
        async (input) => runOperation(MESSAGES_TABLE, input.operation, ctx, input),
    );
}
