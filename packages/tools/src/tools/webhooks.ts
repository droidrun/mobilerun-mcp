import {
    operation,
    sdkOp,
    operationValues,
    operationInput,
    operationDescription,
    runOperation, registerBundle } from './operation-table.js';
import { requireValue } from './op-helpers.js';
// Webhooks bundle tool. Dispatch goes through Backend.webhooks (one method
// per operation), which the public SdkBackend implements over
// @mobilerun/sdk's typed client — never a raw fetch with trust headers.
import {
    webhooksDeleteSchema,
    webhooksDeliveriesSchema,
    webhooksIntegrationTargetsSchema,
} from '../backend/webhooks.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const webhookStatusSchema = z.enum(['active', 'failing', 'blocked', 'disabled']);
const WEBHOOK_SHARED_FIELDS = {
    endpointId: z.string().uuid().optional(),
    eventTypes: z.array(z.string().min(1).max(256)).max(100).optional(),
    description: z.string().max(500).nullable().optional(),
    status: z
        .union([webhookStatusSchema, webhooksDeliveriesSchema.shape.status.unwrap()])
        .optional()
        .describe('Status filter for list or deliveries; each operation accepts its own statuses.'),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(100).optional(),
    since: z.string().optional().describe('ISO 8601 timestamp filter for operation=delivery_stats.'),
};

export const WEBHOOK_TABLE = [
    operation({
        op: 'create',
        input: { url: z.string().url().max(2048).optional(), eventTypes: WEBHOOK_SHARED_FIELDS.eventTypes, description: WEBHOOK_SHARED_FIELDS.description },
        access: 'write',
        describe: { order: 1, text: 'create (url; returns one-time secret + endpoint id), ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const result = await backend.createWebhook({
                url: requireValue(input.url, 'url', operation, 'webhooks'),
                eventTypes: input.eventTypes,
                description: input.description,
            });
            return asTextResult(await withSecretHandling(
                result,
                'Show the returned plaintext data.secret to the user now, exactly once, and tell them to store it securely. Never place it in workflow action data.',
            ));
        },
    }),
    operation({
        op: 'list',
        input: { status: WEBHOOK_SHARED_FIELDS.status, page: WEBHOOK_SHARED_FIELDS.page, pageSize: WEBHOOK_SHARED_FIELDS.pageSize },
        access: 'read',
        describe: { order: 2, text: 'list, ' },
        run: async (ctx, input) => {
            const backend = ctx.backend.webhooks;
            return asTextResult(await backend.listWebhooks({
                status: webhookStatusSchema.optional().parse(input.status),
                page: input.page,
                pageSize: input.pageSize,
            }));
        },
    }),
    operation({
        op: 'get',
        input: { endpointId: WEBHOOK_SHARED_FIELDS.endpointId },
        access: 'read',
        describe: { order: 3, text: 'get, ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const endpointId = requireValue(input.endpointId, 'endpointId', operation, 'webhooks');
            return asTextResult(await backend.getWebhook(endpointId));
        },
    }),
    operation({
        op: 'update',
        input: { endpointId: WEBHOOK_SHARED_FIELDS.endpointId, eventTypes: WEBHOOK_SHARED_FIELDS.eventTypes, state: z.enum(['ACTIVE', 'DISABLED']).optional(), description: WEBHOOK_SHARED_FIELDS.description },
        access: 'write',
        describe: { order: 4, text: 'update, ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const endpointId = requireValue(input.endpointId, 'endpointId', operation, 'webhooks');
            const body = {
                ...(input.eventTypes !== undefined ? { eventTypes: input.eventTypes } : {}),
                ...(input.state !== undefined ? { state: input.state } : {}),
                ...(input.description !== undefined ? { description: input.description } : {}),
            };
            if (Object.keys(body).length === 0) {
                throw new Error('webhooks operation=update requires eventTypes, state, or description');
            }
            return asTextResult(await backend.updateWebhook(endpointId, body));
        },
    }),
    operation({
        op: 'rotate_secret',
        input: { endpointId: WEBHOOK_SHARED_FIELDS.endpointId },
        access: 'write',
        describe: { order: 5, text: 'rotate_secret (explicit consent; returns one-time secret), ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const endpointId = requireValue(input.endpointId, 'endpointId', operation, 'webhooks');
            const result = await backend.rotateWebhookSecret(endpointId);
            return asTextResult(await withSecretHandling(
                result,
                'Show the returned plaintext data.secret to the user now, exactly once, and tell them to store it securely. The previous secret is already invalid.',
            ));
        },
    }),
    operation({
        op: 'test',
        input: { endpointId: WEBHOOK_SHARED_FIELDS.endpointId },
        access: 'write',
        describe: { order: 6, text: 'test, ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const endpointId = requireValue(input.endpointId, 'endpointId', operation, 'webhooks');
            return asTextResult(await backend.testWebhook(endpointId));
        },
    }),
    operation({
        op: 'list_deliveries',
        input: { endpointId: WEBHOOK_SHARED_FIELDS.endpointId, page: WEBHOOK_SHARED_FIELDS.page, pageSize: WEBHOOK_SHARED_FIELDS.pageSize },
        access: 'read',
        describe: { order: 7, text: 'list_deliveries, ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const endpointId = requireValue(input.endpointId, 'endpointId', operation, 'webhooks');
            return asTextResult(await backend.listWebhookDeliveries(endpointId, { page: input.page, pageSize: input.pageSize }));
        },
    }),
    operation({
        op: 'get_delivery',
        input: { endpointId: WEBHOOK_SHARED_FIELDS.endpointId, deliveryId: z.string().uuid().optional() },
        access: 'read',
        describe: { order: 8, text: 'get_delivery, ' },
        run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const endpointId = requireValue(input.endpointId, 'endpointId', operation, 'webhooks');
            const deliveryId = requireValue(input.deliveryId, 'deliveryId', operation, 'webhooks');
            return asTextResult(await backend.getWebhookDelivery(endpointId, deliveryId));
        },
    }),
    operation({
        op: 'delivery_stats',
        input: { since: WEBHOOK_SHARED_FIELDS.since },
        access: 'read',
        describe: {
            order: 9,
            text: 'delivery_stats (account-wide aggregate, optional `since`). Use an endpoint id in the webhooks.send workflow action; never put a signing secret in workflow data. A successful workflow step does not prove delivery—verify by eventId in delivery records. Additional operations: ',
        },
        run: async (ctx, input) => {
            const backend = ctx.backend.webhooks;
            return asTextResult(await backend.getWebhookDeliveryStats({ since: input.since }));
        },
    }),
    sdkOp('delete', webhooksDeleteSchema, (ctx, params) => ctx.backend.webhooks.webhooksDelete(params), 'write', { describe: {
            order: 10,
            text: 'delete: Delete a webhook subscription. deliveries: Read deliveries across all subscriptions. ',
        } }),
    sdkOp('deliveries', webhooksDeliveriesSchema, (ctx, params) => ctx.backend.webhooks.webhooksDeliveries(params), 'read', { describe: { order: 0, text: 'Manage outbound customer webhooks and inspect deliveries. Operations: ' } }),
    sdkOp('integrations', z.object({}), (ctx, params) => ctx.backend.webhooks.webhooksIntegrations(), 'read', { describe: { order: 11, text: 'integrations: Read connected delivery integrations. ' } }),
    sdkOp('integration_targets', webhooksIntegrationTargetsSchema, (ctx, params) => ctx.backend.webhooks.webhooksIntegrationTargets(params), 'read', { describe: { order: 12, text: 'integration_targets: Read delivery targets for an integration.' } }),
] as const;

// Full-set schema — used to type WebhookToolInput regardless of any
// per-credential operation narrowing applied to the registered tool's
// actual input schema (see registerWebhookTools).

function withSecretHandling(result: unknown, secretHandling: string): Record<string, unknown> {
    if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
        return { ...(result as Record<string, unknown>), secretHandling };
    }
    return { result, secretHandling };
}

export function registerWebhookTools(server: McpServer, ctx: ToolCtx): void {
    
    registerBundle(server, ctx, 'webhooks', WEBHOOK_TABLE, { shared: WEBHOOK_SHARED_FIELDS });
}
