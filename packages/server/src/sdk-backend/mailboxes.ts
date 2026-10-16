import { purchaseResult } from './response.js';
import { type default as Mobilerun } from '@mobilerun/sdk';
import { type MailboxesBackend } from '@mobilerun/mcp-tools';

export function createMailboxesBackend(client: Mobilerun): MailboxesBackend {
    return {
        async mailboxesList(params) {
            return client.mailboxes.list({ page: params.page, pageSize: params.pageSize });
        },
        async mailboxesCapacity() {
            return client.mailboxes.capacity();
        },
        async mailboxesCreate(params) {
            return purchaseResult(client.mailboxes.create(
                {
                    billingPreference: params.billingPreference,
                    domainId: params.domainId,
                    label: params.label ?? undefined,
                    localPart: params.localPart,
                },
            ));
        },
        async mailboxesGet(params) {
            return client.mailboxes.retrieve(params.mailboxId);
        },
        async mailboxesUpdate(params) {
            return client.mailboxes.update(params.mailboxId, { label: params.label });
        },
        async mailboxesDelete(params) {
            return client.mailboxes.delete(params.mailboxId);
        },
        async mailboxesUncancel(params) {
            return client.mailboxes.uncancel(params.mailboxId);
        },
        async mailboxesRestart(params) {
            return client.mailboxes.restart(params.mailboxId, { billingPreference: params.billingPreference });
        },
        async mailboxesDisconnect(params) {
            return client.mailboxes.disconnect(params.mailboxId);
        },
        async mailboxesOtp(params) {
            return client.mailboxes.otp(params.mailboxId, {
                after: params.after,
                maxLength: params.maxLength,
                minLength: params.minLength,
                sender: params.sender,
            });
        },
        async mailboxesMessages(params) {
            return client.mailboxes.messages.list(params.mailboxId, {
                after: params.after,
                cursor: params.cursor,
                hasOtp: params.hasOtp === undefined ? undefined : params.hasOtp ? 'true' : 'false',
                limit: params.limit,
                sender: params.sender,
            });
        },
        async mailboxesMessage(params) {
            return client.mailboxes.messages.retrieve(params.messageId, { mailboxId: params.mailboxId });
        },
        async mailboxesConnect(params) {
            return client.mailboxes.connections.create(
                { provider: 'gmail', bindingHash: params.bindingHash, label: params.label },
            );
        },
        async mailboxesConnection(params) {
            return client.mailboxes.connections.retrieve(params.connectionId);
        },
    };
}
