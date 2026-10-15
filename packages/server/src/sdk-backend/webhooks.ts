import { type default as Mobilerun } from '@mobilerun/sdk';
import {
    type CreateWebhookParams,
    type ListWebhookDeliveriesOpts,
    type ListWebhooksOpts,
    type UpdateWebhookParams,
    type WebhookDeliveryStatsOpts,
    type WebhooksBackend,
} from '@mobilerun/mcp-tools';

export function createWebhooksBackend(client: Mobilerun): WebhooksBackend {
    return {
        async webhooksDelete(params) {
            await client.webhooks.delete(params.endpointId);
            return { success: true };
        },
        async webhooksDeliveries(params) {
            return client.webhooks.deliveries.list({
                eventId: params.eventId,
                kind: params.kind,
                page: params.page,
                pageSize: params.pageSize,
                since: params.since,
                status: params.status,
            });
        },
        async webhooksIntegrations() {
            return client.webhooks.integrations.list();
        },
        async webhooksIntegrationTargets(params) {
            return client.webhooks.integrations.listTargets(params.capabilityId, { revision: params.revision });
        },
        async createWebhook(params: CreateWebhookParams) {
            return client.webhooks.create({
                url: params.url,
                eventTypes: params.eventTypes,
                description: params.description ?? undefined,
            });
        },
        // listWebhooks/getWebhook/updateWebhook
        // return @mobilerun/sdk's WebhookListResponse.Item / WebhookRetrieveResponse.Data
        // / WebhookUpdateResponse.Data — none of these SDK response types has a
        // `secret` field (verified against the shipped webhooks.d.ts); only
        // WebhookCreateResponse.Data and WebhookRotateSecretResponse.Data do. The
        // signing secret can therefore never reach a get/list/update tool result
        // through this mapping.
        async listWebhooks(opts: ListWebhooksOpts) {
            return client.webhooks.list({ status: opts.status, page: opts.page, pageSize: opts.pageSize });
        },
        async getWebhook(endpointId: string) {
            return client.webhooks.retrieve(endpointId);
        },
        async updateWebhook(endpointId: string, params: UpdateWebhookParams) {
            return client.webhooks.update(endpointId, {
                eventTypes: params.eventTypes,
                state: params.state,
                description: params.description,
            });
        },
        async rotateWebhookSecret(endpointId: string) {
            return client.webhooks.rotateSecret(endpointId);
        },
        async testWebhook(endpointId: string) {
            return client.webhooks.testDelivery(endpointId);
        },
        async listWebhookDeliveries(endpointId: string, opts: ListWebhookDeliveriesOpts) {
            return client.webhooks.deliveries.listForWebhook(endpointId, {
                page: opts.page,
                pageSize: opts.pageSize,
            });
        },
        async getWebhookDelivery(endpointId: string, deliveryId: string) {
            return client.webhooks.deliveries.retrieveAttempts(deliveryId, { id: endpointId });
        },
        async getWebhookDeliveryStats(opts: WebhookDeliveryStatsOpts) {
            return client.webhooks.deliveries.stats({ since: opts.since });
        },
    };
}
