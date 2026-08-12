import { describe, expect, test } from 'bun:test';
import type Mobilerun from '@mobilerun/sdk';
import { createWebhooksBackend } from '../sdk-backend/webhooks.js';

// The webhooks signing secret is shown
// exactly once, on create/rotate_secret. This exercises the actual
// SdkBackend mapping (not a stub) against fixtures shaped like
// @mobilerun/sdk's real response types — WebhookRetrieveResponse.Data /
// WebhookListResponse.Item / WebhookUpdateResponse.Data have no `secret`
// field at all (verified against the shipped webhooks.d.ts); only
// WebhookCreateResponse.Data / WebhookRotateSecretResponse.Data do. A future
// change to createWebhooksBackend that accidentally started forwarding a
// secret on get/list/update (or stopped forwarding it on create/rotate)
// would fail this test.
function mockClient(): Mobilerun {
    const webhookWithoutSecret = {
        id: 'wh-1',
        blockedAt: null,
        blockedReason: null,
        createdAt: '2026-01-01T00:00:00Z',
        description: null,
        eventTypes: ['app.custom'],
        health: 'healthy' as const,
        signingEnabled: true,
        state: 'ACTIVE' as const,
        updatedAt: '2026-01-01T00:00:00Z',
        url: 'https://example.com/hook',
    };
    const webhookWithSecret = { ...webhookWithoutSecret, secret: 'whsec_shown_once' };

    return {
        webhooks: {
            retrieve: async () => ({ data: webhookWithoutSecret }),
            list: async () => ({
                items: [webhookWithoutSecret],
                pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
                counts: { total: 1, active: 1, failing: 0, blocked: 0, disabled: 0 },
            }),
            update: async () => ({ data: webhookWithoutSecret }),
            create: async () => ({ data: webhookWithSecret }),
            rotateSecret: async () => ({ data: webhookWithSecret }),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as Mobilerun;
}

describe('createWebhooksBackend — secret only on create/rotate_secret', () => {
    test('getWebhook output has no secret field', async () => {
        const backend = createWebhooksBackend(mockClient());
        const result = await backend.getWebhook('wh-1');
        expect(result.data).not.toHaveProperty('secret');
    });

    test('listWebhooks output items have no secret field', async () => {
        const backend = createWebhooksBackend(mockClient());
        const result = await backend.listWebhooks({});
        expect(result.items[0]).not.toHaveProperty('secret');
    });

    test('updateWebhook output has no secret field', async () => {
        const backend = createWebhooksBackend(mockClient());
        const result = await backend.updateWebhook('wh-1', { state: 'DISABLED' });
        expect(result.data).not.toHaveProperty('secret');
    });

    test('createWebhook output DOES carry the one-time secret', async () => {
        const backend = createWebhooksBackend(mockClient());
        const result = await backend.createWebhook({ url: 'https://example.com/hook' });
        expect(result.data.secret).toBe('whsec_shown_once');
    });

    test('rotateWebhookSecret output DOES carry the one-time secret', async () => {
        const backend = createWebhooksBackend(mockClient());
        const result = await backend.rotateWebhookSecret('wh-1');
        expect(result.data.secret).toBe('whsec_shown_once');
    });
});
