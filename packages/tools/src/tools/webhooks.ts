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

const WEBHOOK_OPERATIONS = [
    'create',
    'list',
    'get',
    'update',
    'rotate_secret',
    'test',
    'list_deliveries',
    'get_delivery',
    'delivery_stats',
    'delete',
    'deliveries',
    'integrations',
    'integration_targets',
] as const;
// Full-set schema — used to type WebhookToolInput regardless of any
// per-credential operation narrowing applied to the registered tool's
// actual input schema (see registerWebhookTools).
const webhookOperationSchema = z.enum(WEBHOOK_OPERATIONS);
const webhookStatusSchema = z.enum(['active', 'failing', 'blocked', 'disabled']);

type WebhookToolInput = {
    operation: z.infer<typeof webhookOperationSchema>;
    [key: string]: unknown;
    endpointId?: string;
    deliveryId?: string;
    url?: string;
    eventTypes?: string[];
    description?: string | null;
    state?: 'ACTIVE' | 'DISABLED';
    status?: z.infer<typeof webhookStatusSchema>;
    page?: number;
    pageSize?: number;
    since?: string;
};


function withSecretHandling(result: unknown, secretHandling: string): Record<string, unknown> {
    if (result !== null && typeof result === 'object' && !Array.isArray(result)) {
        return { ...(result as Record<string, unknown>), secretHandling };
    }
    return { result, secretHandling };
}

async function executeWebhookOperation(input: WebhookToolInput, ctx: ToolCtx): Promise<unknown> {
    if (input.operation === 'delete')
        return ctx.backend.webhooks.webhooksDelete(webhooksDeleteSchema.strip().parse(input));
    if (input.operation === 'deliveries')
        return ctx.backend.webhooks.webhooksDeliveries(webhooksDeliveriesSchema.strip().parse(input));
    if (input.operation === 'integrations') return ctx.backend.webhooks.webhooksIntegrations();
    if (input.operation === 'integration_targets')
        return ctx.backend.webhooks.webhooksIntegrationTargets(webhooksIntegrationTargetsSchema.strip().parse(input));
    const { operation } = input;
    const backend = ctx.backend.webhooks;

    if (operation === 'create') {
        const result = await backend.createWebhook({
            url: requireValue(input.url, 'url', operation, 'webhooks'),
            eventTypes: input.eventTypes,
            description: input.description,
        });
        return withSecretHandling(
            result,
            'Show the returned plaintext data.secret to the user now, exactly once, and tell them to store it securely. Never place it in workflow action data.',
        );
    }

    if (operation === 'list') {
        return backend.listWebhooks({
            status: webhookStatusSchema.optional().parse(input.status),
            page: input.page,
            pageSize: input.pageSize,
        });
    }

    // Account-wide, no endpointId — must be handled before the endpointId
    // requirement below.
    if (operation === 'delivery_stats') return backend.getWebhookDeliveryStats({ since: input.since });

    const endpointId = requireValue(input.endpointId, 'endpointId', operation, 'webhooks');

    // get/list/update never return the signing secret — the WebhookDto.secret
    // field is only populated by create/rotate_secret's own SDK response
    // type, verified against the shipped .d.ts (see sdk-backend/webhooks.ts).
    // This is a deliberate, accepted design: the signing secret is shown
    // exactly once, at generation time, and never again.
    if (operation === 'get') return backend.getWebhook(endpointId);

    if (operation === 'update') {
        const body = {
            ...(input.eventTypes !== undefined ? { eventTypes: input.eventTypes } : {}),
            ...(input.state !== undefined ? { state: input.state } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
        };
        if (Object.keys(body).length === 0) {
            throw new Error('webhooks operation=update requires eventTypes, state, or description');
        }
        return backend.updateWebhook(endpointId, body);
    }

    if (operation === 'rotate_secret') {
        const result = await backend.rotateWebhookSecret(endpointId);
        return withSecretHandling(
            result,
            'Show the returned plaintext data.secret to the user now, exactly once, and tell them to store it securely. The previous secret is already invalid.',
        );
    }

    if (operation === 'test') return backend.testWebhook(endpointId);

    if (operation === 'list_deliveries') {
        return backend.listWebhookDeliveries(endpointId, { page: input.page, pageSize: input.pageSize });
    }

    const deliveryId = requireValue(input.deliveryId, 'deliveryId', operation, 'webhooks');
    return backend.getWebhookDelivery(endpointId, deliveryId);
}

export function registerWebhookTools(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(WEBHOOK_OPERATIONS, ctx.policy.operationAllowlist?.get('webhooks'));

    server.registerTool(
        'webhooks',
        {
            description:
                'Manage outbound customer webhooks and inspect deliveries. Operations: create (url; returns one-time secret + endpoint id), list, get, update, rotate_secret (explicit consent; returns one-time secret), test, list_deliveries, get_delivery, delivery_stats (account-wide aggregate, optional `since`). Use an endpoint id in the webhooks.send workflow action; never put a signing secret in workflow data. A successful workflow step does not prove delivery—verify by eventId in delivery records.' +
                ' Additional operations: delete: Delete a webhook subscription. deliveries: Read deliveries across all subscriptions. integrations: Read connected delivery integrations. integration_targets: Read delivery targets for an integration.' +
                allowedValuesNote(operationValues, WEBHOOK_OPERATIONS),
            inputSchema: {
                // Enum stays the FULL set — see the identical note in
                // tools/workflows.ts's registerWorkflowTools for why: dispatch-time
                // rejection in register.ts is the actual enforcement point.
                operation: webhookOperationSchema,
                ...webhooksDeleteSchema.partial().shape,
                ...webhooksDeliveriesSchema.partial().shape,
                ...webhooksIntegrationTargetsSchema.partial().shape,
                endpointId: z.string().uuid().optional(),
                deliveryId: z.string().uuid().optional(),
                url: z.string().url().max(2048).optional(),
                eventTypes: z.array(z.string().min(1).max(256)).max(100).optional(),
                description: z.string().max(500).nullable().optional(),
                state: z.enum(['ACTIVE', 'DISABLED']).optional(),
                status: z
                    .union([webhookStatusSchema, webhooksDeliveriesSchema.shape.status.unwrap()])
                    .optional()
                    .describe('Status filter for list or deliveries; each operation accepts its own statuses.'),
                page: z.number().int().positive().optional(),
                pageSize: z.number().int().positive().max(100).optional(),
                since: z.string().optional().describe('ISO 8601 timestamp filter for operation=delivery_stats.'),
            },
        },
        async (input) => asTextResult(await executeWebhookOperation(input as WebhookToolInput, ctx)),
    );
}
