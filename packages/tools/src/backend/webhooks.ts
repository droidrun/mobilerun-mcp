// Webhooks port — see devices.ts's file header for the DTO philosophy.
// Mirrors @mobilerun/sdk's webhooks / webhooks.deliveries response shapes
// (verified against the SDK's shipped .d.ts) — including which endpoints
// wrap their payload in a `{ data: ... }` envelope and which don't; this
// package doesn't normalize that inconsistency away, it types it faithfully
// so tool output shapes don't silently change.
import type { PageMeta } from './devices.js';

export interface ListWebhooksOpts {
    status?: 'active' | 'failing' | 'blocked' | 'disabled';
    page?: number;
    pageSize?: number;
}
export interface CreateWebhookParams {
    url: string;
    eventTypes?: string[];
    description?: string | null;
}
export interface UpdateWebhookParams {
    eventTypes?: string[];
    state?: 'ACTIVE' | 'DISABLED';
    description?: string | null;
}
export interface ListWebhookDeliveriesOpts {
    page?: number;
    pageSize?: number;
}
export interface WebhookDeliveryStatsOpts {
    since?: string;
}

export interface WebhookDto {
    id: string;
    url: string;
    description: string | null;
    eventTypes: string[];
    state: 'ACTIVE' | 'DISABLED' | 'DELETED';
    health: 'healthy' | 'failing' | 'blocked';
    signingEnabled: boolean;
    blockedAt: string | null;
    blockedReason: string | null;
    createdAt: string;
    updatedAt: string;
    /** Present only on create/rotate_secret — shown once, never on get/list/update
     * (enforced structurally in sdk-backend/webhooks.ts —
     * getWebhook/listWebhooks/updateWebhook map SDK response types that have no
     * `secret` field, verified against the shipped .d.ts). */
    secret?: string;
}
export interface WebhookEnvelopeDto {
    data: WebhookDto;
}
export interface WebhookListDto {
    items: WebhookDto[];
    pagination: PageMeta;
    counts?: { total: number; active: number; failing: number; blocked: number; disabled: number };
}

export interface WebhookTestResultDto {
    data: { success: boolean; statusCode: number | null; error: string | null };
}

export interface WebhookDeliveryDto {
    id: string;
    endpointId: string;
    eventId: string;
    eventType: string;
    source: string;
    status: 'pending' | 'success' | 'skipped' | 'dead';
    attempts: number;
    isTest: boolean;
    lastStatusCode: number | null;
    lastError: string | null;
    durationMs: number | null;
    occurredAt: string;
    completedAt: string | null;
    createdAt: string;
}
export interface WebhookDeliveryListDto {
    items: WebhookDeliveryDto[];
    pagination: PageMeta;
}

export interface WebhookDeliveryAttemptDto {
    attemptNo: number;
    requestMethod: string;
    requestUrl: string;
    responseStatus: number | null;
    responseSnippet: string | null;
    error: string | null;
    durationMs: number | null;
    signed: boolean;
    sentAt: string;
}
// Note: the single-delivery detail's `attempts` field REPLACES the list
// item's `attempts` count with the actual attempt records (verified against
// DeliveryRetrieveAttemptsResponse.Data) — not an extension of it.
export type WebhookDeliveryDetailDto = Omit<WebhookDeliveryDto, 'attempts'> & { attempts: WebhookDeliveryAttemptDto[] };
export interface WebhookDeliveryDetailEnvelopeDto {
    data: WebhookDeliveryDetailDto;
}

export interface WebhookDeliveryStatsDto {
    data: {
        byStatus: { dead: number; pending: number; skipped: number; success: number };
        successRate: number | null;
        total: number;
    };
}

export interface WebhookEventTypesDto {
    data: {
        schemaVersion: number;
        sources: Array<{ source: string; events: Array<{ type: string; description: string }> }>;
    };
}

export interface WebhooksBackend {
    createWebhook(params: CreateWebhookParams): Promise<WebhookEnvelopeDto>;
    listWebhooks(opts: ListWebhooksOpts): Promise<WebhookListDto>;
    getWebhook(endpointId: string): Promise<WebhookEnvelopeDto>;
    updateWebhook(endpointId: string, params: UpdateWebhookParams): Promise<WebhookEnvelopeDto>;
    rotateWebhookSecret(endpointId: string): Promise<WebhookEnvelopeDto>;
    testWebhook(endpointId: string): Promise<WebhookTestResultDto>;
    listWebhookDeliveries(endpointId: string, opts: ListWebhookDeliveriesOpts): Promise<WebhookDeliveryListDto>;
    getWebhookDelivery(endpointId: string, deliveryId: string): Promise<WebhookDeliveryDetailEnvelopeDto>;
    getWebhookDeliveryStats(opts: WebhookDeliveryStatsOpts): Promise<WebhookDeliveryStatsDto>;
    listWebhookEventTypes(): Promise<WebhookEventTypesDto>;
}
