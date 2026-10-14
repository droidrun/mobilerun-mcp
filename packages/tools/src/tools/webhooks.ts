import { type Operation, operationValues, selectInput, operationInput, operationDescription, runOperation, unassignedInput } from './operation-table.js';
import { requireValue } from './op-helpers.js';
// Webhooks bundle tool. Dispatch goes through Backend.webhooks (one method
// per operation), which the public SdkBackend implements over
// @mobilerun/sdk's typed client — never a raw fetch with trust headers.
import { webhooksDeleteSchema, webhooksDeliveriesSchema, webhooksIntegrationTargetsSchema, } from '../backend/webhooks.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const webhookStatusSchema = z.enum(['active', 'failing', 'blocked', 'disabled']);
const WEBHOOK_INPUT_FIELDS = {
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
    since: z.string().optional().describe('ISO 8601 timestamp filter for operation=delivery_stats.')
};
type WEBHOOK_INPUT = z.infer<z.ZodObject<typeof WEBHOOK_INPUT_FIELDS>> & {
    operation: string;
};
export const WEBHOOK_TABLE = [
    { op: "create", input: selectInput(WEBHOOK_INPUT_FIELDS, ["url", "eventTypes", "description"]), readonly: false, billed: false, describe: { "order": 1, "text": "create (url; returns one-time secret + endpoint id), " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const result = await backend.createWebhook({
                url: requireValue(input.url, 'url', operation, 'webhooks'),
                eventTypes: input.eventTypes,
                description: input.description,
            });
            return withSecretHandling(result, 'Show the returned plaintext data.secret to the user now, exactly once, and tell them to store it securely. Never place it in workflow action data.');
        } },
    { op: "list", input: selectInput(WEBHOOK_INPUT_FIELDS, ["status", "page", "pageSize"]), readonly: true, billed: false, describe: { "order": 2, "text": "list, " }, run: async (ctx, input) => {
            const backend = ctx.backend.webhooks;
            return backend.listWebhooks({
                status: webhookStatusSchema.optional().parse(input.status),
                page: input.page,
                pageSize: input.pageSize,
            });
        } },
    { op: "get", input: selectInput(WEBHOOK_INPUT_FIELDS, ["endpointId"]), readonly: true, billed: false, describe: { "order": 3, "text": "get, " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const endpointId = requireValue(input.endpointId, 'endpointId', operation, 'webhooks');
            return backend.getWebhook(endpointId);
        } },
    { op: "update", input: selectInput(WEBHOOK_INPUT_FIELDS, ["endpointId", "eventTypes", "state", "description"]), readonly: false, billed: false, describe: { "order": 4, "text": "update, " }, run: async (ctx, input) => {
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
            return backend.updateWebhook(endpointId, body);
        } },
    { op: "rotate_secret", input: selectInput(WEBHOOK_INPUT_FIELDS, ["endpointId"]), readonly: false, billed: false, describe: { "order": 5, "text": "rotate_secret (explicit consent; returns one-time secret), " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const endpointId = requireValue(input.endpointId, 'endpointId', operation, 'webhooks');
            const result = await backend.rotateWebhookSecret(endpointId);
            return withSecretHandling(result, 'Show the returned plaintext data.secret to the user now, exactly once, and tell them to store it securely. The previous secret is already invalid.');
        } },
    { op: "test", input: selectInput(WEBHOOK_INPUT_FIELDS, ["endpointId"]), readonly: false, billed: false, describe: { "order": 6, "text": "test, " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const endpointId = requireValue(input.endpointId, 'endpointId', operation, 'webhooks');
            return backend.testWebhook(endpointId);
        } },
    { op: "list_deliveries", input: selectInput(WEBHOOK_INPUT_FIELDS, ["endpointId", "page", "pageSize"]), readonly: true, billed: false, describe: { "order": 7, "text": "list_deliveries, " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const endpointId = requireValue(input.endpointId, 'endpointId', operation, 'webhooks');
            return backend.listWebhookDeliveries(endpointId, { page: input.page, pageSize: input.pageSize });
        } },
    { op: "get_delivery", input: selectInput(WEBHOOK_INPUT_FIELDS, ["endpointId", "deliveryId"]), readonly: true, billed: false, describe: { "order": 8, "text": "get_delivery, " }, run: async (ctx, input) => {
            const { operation } = input;
            const backend = ctx.backend.webhooks;
            const endpointId = requireValue(input.endpointId, 'endpointId', operation, 'webhooks');
            const deliveryId = requireValue(input.deliveryId, 'deliveryId', operation, 'webhooks');
            return backend.getWebhookDelivery(endpointId, deliveryId);
        } },
    { op: "delivery_stats", input: selectInput(WEBHOOK_INPUT_FIELDS, ["since"]), readonly: true, billed: false, describe: { "order": 9, "text": "delivery_stats (account-wide aggregate, optional `since`). Use an endpoint id in the webhooks.send workflow action; never put a signing secret in workflow data. A successful workflow step does not prove delivery—verify by eventId in delivery records. Additional operations: " }, run: async (ctx, input) => {
            const backend = ctx.backend.webhooks;
            return backend.getWebhookDeliveryStats({ since: input.since });
        } },
    { op: "delete", input: selectInput(WEBHOOK_INPUT_FIELDS, [...Object.keys(webhooksDeleteSchema.shape)]), readonly: false, billed: false, describe: { "order": 10, "text": "delete: Delete a webhook subscription. deliveries: Read deliveries across all subscriptions. " }, run: async (ctx, input) => {
            return ctx.backend.webhooks.webhooksDelete(webhooksDeleteSchema.strip().parse(input));
        } },
    { op: "deliveries", input: selectInput(WEBHOOK_INPUT_FIELDS, [...Object.keys(webhooksDeliveriesSchema.shape)]), readonly: true, billed: false, describe: { "order": 0, "text": "Manage outbound customer webhooks and inspect deliveries. Operations: " }, run: async (ctx, input) => {
            return ctx.backend.webhooks.webhooksDeliveries(webhooksDeliveriesSchema.strip().parse(input));
        } },
    { op: "integrations", input: selectInput(WEBHOOK_INPUT_FIELDS, []), readonly: true, billed: false, describe: { "order": 11, "text": "integrations: Read connected delivery integrations. " }, run: async (ctx, input) => {
            return ctx.backend.webhooks.webhooksIntegrations();
        } },
    { op: "integration_targets", input: selectInput(WEBHOOK_INPUT_FIELDS, [...Object.keys(webhooksIntegrationTargetsSchema.shape)]), readonly: true, billed: false, describe: { "order": 12, "text": "integration_targets: Read delivery targets for an integration." }, run: async (ctx, input) => {
            return ctx.backend.webhooks.webhooksIntegrationTargets(webhooksIntegrationTargetsSchema.strip().parse(input));
        } },
] as const satisfies readonly Operation<WEBHOOK_INPUT>[];
const WEBHOOK_OPERATIONS = operationValues(WEBHOOK_TABLE);
// Full-set schema — used to type WebhookToolInput regardless of any
// per-credential operation narrowing applied to the registered tool's
// actual input schema (see registerWebhookTools).
const webhookOperationSchema = z.enum(WEBHOOK_OPERATIONS);
type WebhookToolInput = {
    operation: string;
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
async function executeWebhookOperation(input: WebhookToolInput, ctx: ToolCtx): Promise<unknown> { return runOperation(WEBHOOK_TABLE, input.operation, ctx, input); }
export function registerWebhookTools(server: McpServer, ctx: ToolCtx): void {
    const operationValues = narrowedValues(WEBHOOK_OPERATIONS, ctx.policy.operationAllowlist?.get('webhooks'));
    server.registerTool('webhooks', {
        description: operationDescription(WEBHOOK_TABLE) + allowedValuesNote(operationValues, WEBHOOK_OPERATIONS),
        inputSchema: { operation: z.enum(WEBHOOK_OPERATIONS), ...operationInput(WEBHOOK_TABLE, WEBHOOK_INPUT_FIELDS, unassignedInput(WEBHOOK_INPUT_FIELDS, WEBHOOK_TABLE)) },
    }, async (input) => asTextResult(await executeWebhookOperation(input as WebhookToolInput, ctx)));
}
