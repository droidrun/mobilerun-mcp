import { operation, registerBundle, requireValue, sdkOp } from './operation-table.js';
// Webhooks bundle tool. Dispatch goes through Backend.webhooks (one method
// per operation), which the public SdkBackend implements over
// @mobilerun/sdk's typed client — never a raw fetch with trust headers.
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { webhooksDeleteSchema, webhooksDeliveriesSchema, webhooksIntegrationTargetsSchema } from '../backend/webhooks.js';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
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

const WEBHOOK_INTRO =
    'Manage outbound customer webhooks and inspect deliveries. Use an endpoint id in the webhooks.send workflow action; never put a signing secret in workflow data. A successful workflow step does not prove delivery: verify by eventId in delivery records.';
export const WEBHOOK_TABLE = [
    operation({
        op: 'create',
        input: {
            url: z.string().url().max(2048).optional(),
            eventTypes: WEBHOOK_SHARED_FIELDS.eventTypes,
            description: WEBHOOK_SHARED_FIELDS.description,
        },
        access: 'write',
        doc: 'Create a webhook (url); returns an endpoint id and a secret shown exactly once.',
        run: async (ctx, input) => {
            const result = await ctx.backend.webhooks.createWebhook({
                url: requireValue(input.url, 'url', input.operation, 'webhooks'),
                eventTypes: input.eventTypes,
                description: input.description,
            });
            return asTextResult(
                withSecretHandling(
                    result,
                    'Show the returned plaintext data.secret to the user now, exactly once, and tell them to store it securely. Never place it in workflow action data.',
                ),
            );
        },
    }),
    operation({
        op: 'list',
        input: {
            status: WEBHOOK_SHARED_FIELDS.status,
            page: WEBHOOK_SHARED_FIELDS.page,
            pageSize: WEBHOOK_SHARED_FIELDS.pageSize,
        },
        access: 'read',
        doc: 'List webhook subscriptions.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.webhooks.listWebhooks({
                    status: webhookStatusSchema.optional().parse(input.status),
                    page: input.page,
                    pageSize: input.pageSize,
                }),
            ),
    }),
    operation({
        op: 'get',
        input: { endpointId: WEBHOOK_SHARED_FIELDS.endpointId },
        access: 'read',
        doc: 'Read a webhook subscription.',
        run: async (ctx, input) =>
            asTextResult(await ctx.backend.webhooks.getWebhook(requireValue(input.endpointId, 'endpointId', input.operation, 'webhooks'))),
    }),
    operation({
        op: 'update',
        input: {
            endpointId: WEBHOOK_SHARED_FIELDS.endpointId,
            eventTypes: WEBHOOK_SHARED_FIELDS.eventTypes,
            state: z.enum(['ACTIVE', 'DISABLED']).optional(),
            description: WEBHOOK_SHARED_FIELDS.description,
        },
        access: 'write',
        doc: 'Update a webhook subscription.',
        run: async (ctx, input) => {
            const endpointId = requireValue(input.endpointId, 'endpointId', input.operation, 'webhooks');
            const body = {
                ...(input.eventTypes !== undefined ? { eventTypes: input.eventTypes } : {}),
                ...(input.state !== undefined ? { state: input.state } : {}),
                ...(input.description !== undefined ? { description: input.description } : {}),
            };
            if (Object.keys(body).length === 0) {
                throw new Error('webhooks operation=update requires eventTypes, state, or description');
            }
            return asTextResult(await ctx.backend.webhooks.updateWebhook(endpointId, body));
        },
    }),
    operation({
        op: 'rotate_secret',
        input: { endpointId: WEBHOOK_SHARED_FIELDS.endpointId },
        access: 'write',
        doc: 'Rotate the signing secret only with explicit consent; returns a secret shown exactly once.',
        run: async (ctx, input) => {
            const endpointId = requireValue(input.endpointId, 'endpointId', input.operation, 'webhooks');
            const result = await ctx.backend.webhooks.rotateWebhookSecret(endpointId);
            return asTextResult(
                withSecretHandling(
                    result,
                    'Show the returned plaintext data.secret to the user now, exactly once, and tell them to store it securely. The previous secret is already invalid.',
                ),
            );
        },
    }),
    operation({
        op: 'test',
        input: { endpointId: WEBHOOK_SHARED_FIELDS.endpointId },
        access: 'write',
        doc: 'Send a test delivery.',
        run: async (ctx, input) =>
            asTextResult(await ctx.backend.webhooks.testWebhook(requireValue(input.endpointId, 'endpointId', input.operation, 'webhooks'))),
    }),
    operation({
        op: 'list_deliveries',
        input: {
            endpointId: WEBHOOK_SHARED_FIELDS.endpointId,
            page: WEBHOOK_SHARED_FIELDS.page,
            pageSize: WEBHOOK_SHARED_FIELDS.pageSize,
        },
        access: 'read',
        doc: 'Read deliveries for an endpoint.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.webhooks.listWebhookDeliveries(
                    requireValue(input.endpointId, 'endpointId', input.operation, 'webhooks'),
                    {
                        page: input.page,
                        pageSize: input.pageSize,
                    },
                ),
            ),
    }),
    operation({
        op: 'get_delivery',
        input: { endpointId: WEBHOOK_SHARED_FIELDS.endpointId, deliveryId: z.string().uuid().optional() },
        access: 'read',
        doc: 'Read one endpoint delivery.',
        run: async (ctx, input) => {
            const endpointId = requireValue(input.endpointId, 'endpointId', input.operation, 'webhooks');
            const deliveryId = requireValue(input.deliveryId, 'deliveryId', input.operation, 'webhooks');
            return asTextResult(await ctx.backend.webhooks.getWebhookDelivery(endpointId, deliveryId));
        },
    }),
    operation({
        op: 'delivery_stats',
        input: { since: WEBHOOK_SHARED_FIELDS.since },
        access: 'read',
        doc: 'Read account-wide delivery statistics, optionally since an ISO timestamp.',
        run: async (ctx, input) => asTextResult(await ctx.backend.webhooks.getWebhookDeliveryStats({ since: input.since })),
    }),
    sdkOp('delete', webhooksDeleteSchema, (ctx, params) => ctx.backend.webhooks.webhooksDelete(params), 'write', {
        doc: 'Delete a webhook subscription.',
    }),
    sdkOp('deliveries', webhooksDeliveriesSchema, (ctx, params) => ctx.backend.webhooks.webhooksDeliveries(params), 'read', {
        doc: 'Read deliveries across all subscriptions.',
    }),
    sdkOp('integrations', z.object({}), (ctx) => ctx.backend.webhooks.webhooksIntegrations(), 'read', {
        doc: 'Read connected delivery integrations.',
    }),
    sdkOp(
        'integration_targets',
        webhooksIntegrationTargetsSchema,
        (ctx, params) => ctx.backend.webhooks.webhooksIntegrationTargets(params),
        'read',
        { doc: 'Read delivery targets for an integration.' },
    ),
] as const;

function withSecretHandling(result: unknown, secretHandling: string): Record<string, unknown> {
    if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
        return { ...(result as Record<string, unknown>), secretHandling };
    }
    return { result, secretHandling };
}

export function registerWebhookTools(server: McpServer, ctx: ToolCtx): void {
    registerBundle(server, ctx, 'webhooks', WEBHOOK_TABLE, { intro: WEBHOOK_INTRO, shared: WEBHOOK_SHARED_FIELDS });
}
