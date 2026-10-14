import { type default as Mobilerun } from '@mobilerun/sdk';
import { type MessagesBackend } from '@mobilerun/mcp-tools';

export function createMessagesBackend(client: Mobilerun): MessagesBackend {
    return {
        async messagesList(params) {
            return client.messages.list({
                direction: params.direction,
                esimId: params.esimId,
                numberId: params.numberId,
                page: params.page,
                pageSize: params.pageSize,
                peerKey: params.peerKey,
                peerNumber: params.peerNumber,
                status: params.status,
            });
        },
        async messagesGet(params) {
            return client.messages.retrieve(params.messageId);
        },
        async messagesConversations(params) {
            return client.messages.conversations.list({
                cursorLastMessageId: params.cursorLastMessageId,
                cursorLastOccurredAt: params.cursorLastOccurredAt,
                esimId: params.esimId,
                limit: params.limit,
                numberId: params.numberId,
            });
        },
        async messagesMarkRead(params) {
            return client.messages.conversations.markRead({
                peerKey: params.peerKey,
                upToMessageId: params.upToMessageId,
                upToOccurredAt: params.upToOccurredAt,
            });
        },
    };
}
