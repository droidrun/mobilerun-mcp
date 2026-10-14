import { z } from 'zod';
import { smsDirectionSchema, smsStatusSchema } from './communication.js';

export const messagesListSchema = z
    .object({
        direction: smsDirectionSchema.optional(),
        esimId: z.string().optional(),
        numberId: z.string().optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
        peerKey: z.string().optional(),
        peerNumber: z.string().optional(),
        status: smsStatusSchema.optional(),
    })
    .strict();

export const messagesGetSchema = z
    .object({
        messageId: z.string(),
    })
    .strict();

export const messagesConversationsSchema = z
    .object({
        cursorLastMessageId: z.string().optional(),
        cursorLastOccurredAt: z.string().optional(),
        esimId: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
        numberId: z.string().optional(),
    })
    .strict();

export const messagesMarkReadSchema = z
    .object({
        peerKey: z.string(),
        upToMessageId: z.string(),
        upToOccurredAt: z.string(),
    })
    .strict();

export interface MessagesBackend {
    messagesList(params: z.infer<typeof messagesListSchema>): Promise<unknown>;
    messagesGet(params: z.infer<typeof messagesGetSchema>): Promise<unknown>;
    messagesConversations(params: z.infer<typeof messagesConversationsSchema>): Promise<unknown>;
    messagesMarkRead(params: z.infer<typeof messagesMarkReadSchema>): Promise<unknown>;
}
