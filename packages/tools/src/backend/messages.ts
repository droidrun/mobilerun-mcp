import { z } from 'zod';
export const messagesListSchema = z
    .object({
        direction: z.union([z.literal('all'), z.literal('inbound'), z.literal('outbound')]).optional(),
        esimId: z.string().optional(),
        numberId: z.string().optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
        peerKey: z.string().optional(),
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
