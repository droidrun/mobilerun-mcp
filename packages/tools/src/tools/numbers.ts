import {
    operation,
    operationValues,
    operationInput,
    operationDescription,
    runOperation,
} from './operation-table.js';
import { awaitCheckoutUrl } from './checkout.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { billingPreferenceSchema, smsDirectionSchema } from '../backend/communication.js';
import {
    numbersCapacitySchema,
    numbersListSchema,
    numbersGetSchema,
    numbersCreateSchema,
    numbersUpdateSchema,
    numbersDeleteSchema,
    numbersMessagesSchema,
    numbersSendSchema,
} from '../backend/numbers.js';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const NUMBERS_SHARED_FIELDS = {
    billingPreference: billingPreferenceSchema.optional(),
    country: z.string().optional().describe('Country code from countries. Required for capacity.'),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(100).optional(),
    numberId: z.string().optional().describe('Required for get/update/delete/messages/send.'),
    label: z.union([z.string(), z.null()]).optional(),
    clientRequestId: z
        .string()
        .min(1)
        .max(128)
        .optional()
        .describe('Optional stable purchase request key; reuse it for retries.'),
    direction: smsDirectionSchema.optional(),
    since: z.string().optional(),
    body: z.string().optional().describe('Required SMS text for send.'),
    to: z.string().optional().describe('Required destination phone number for send.'),
    deliveryReport: z.boolean().optional(),
};

export const NUMBERS_TABLE = [
    operation({
        op: 'countries',
        input: {  },
        access: 'read',
        describe: { order: 0, text: 'countries: List available countries and number availability. ' },
        run: async (ctx, raw) => {
            const backend = ctx.backend.numbers;
            return asTextResult(await backend.numbersCountries());
        },
    }),
    operation({
        op: 'capacity',
        input: { ...numbersCapacitySchema.partial().shape, country: NUMBERS_SHARED_FIELDS.country },
        access: 'read',
        describe: { order: 1, text: 'capacity: Read included number capacity for a country. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.numbers;
            return asTextResult(await backend.numbersCapacity(numbersCapacitySchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'list',
        input: { ...numbersListSchema.partial().shape, page: NUMBERS_SHARED_FIELDS.page, pageSize: NUMBERS_SHARED_FIELDS.pageSize },
        access: 'read',
        describe: { order: 2, text: 'list: List owned phone numbers. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.numbers;
            return asTextResult(await backend.numbersList(numbersListSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'get',
        input: { ...numbersGetSchema.partial().shape, numberId: NUMBERS_SHARED_FIELDS.numberId },
        access: 'read',
        describe: { order: 3, text: 'get: Read one phone number. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.numbers;
            return asTextResult(await backend.numbersGet(numbersGetSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'create',
        input: { ...numbersCreateSchema.partial().shape, billingPreference: NUMBERS_SHARED_FIELDS.billingPreference, country: NUMBERS_SHARED_FIELDS.country, label: NUMBERS_SHARED_FIELDS.label, clientRequestId: NUMBERS_SHARED_FIELDS.clientRequestId },
        access: 'commerce',
        describe: {
            order: 4,
            text: 'create: Create a phone number. billingPreference: included uses included capacity then falls back to rent; included_only fails when included capacity is exhausted; rent always starts paid service. Omit it for the API default. Poll get for status. ',
        },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.numbers;
            return asTextResult(
                await awaitCheckoutUrl(
                    await backend.numbersCreate(numbersCreateSchema.strip().parse(input)),
                    'numberId',
                    (id) => backend.numbersGet({ numberId: id }),
                ),
            );
        },
    }),
    operation({
        op: 'update',
        input: { ...numbersUpdateSchema.partial().shape, numberId: NUMBERS_SHARED_FIELDS.numberId, label: NUMBERS_SHARED_FIELDS.label },
        access: 'write',
        describe: { order: 5, text: 'update: Update the display label. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.numbers;
            return asTextResult(await backend.numbersUpdate(numbersUpdateSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'delete',
        input: { ...numbersDeleteSchema.partial().shape, numberId: NUMBERS_SHARED_FIELDS.numberId },
        access: 'commerce',
        describe: { order: 6, text: 'delete: Cancel a pending purchase or schedule cancellation of a paid number. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.numbers;
            return asTextResult(await backend.numbersDelete(numbersDeleteSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'messages',
        input: { ...numbersMessagesSchema.partial().shape, numberId: NUMBERS_SHARED_FIELDS.numberId, direction: NUMBERS_SHARED_FIELDS.direction, page: NUMBERS_SHARED_FIELDS.page, pageSize: NUMBERS_SHARED_FIELDS.pageSize, since: NUMBERS_SHARED_FIELDS.since },
        access: 'read',
        describe: { order: 7, text: 'messages: Read SMS for one number, optionally filtered by direction or time. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.numbers;
            return asTextResult(await backend.numbersMessages(numbersMessagesSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'send',
        input: { ...numbersSendSchema.partial().shape, numberId: NUMBERS_SHARED_FIELDS.numberId, body: NUMBERS_SHARED_FIELDS.body, to: NUMBERS_SHARED_FIELDS.to, deliveryReport: NUMBERS_SHARED_FIELDS.deliveryReport },
        access: 'commerce',
        describe: { order: 8, text: 'send: Send an SMS from an active number; charges and limits may apply.' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.numbers;
            return asTextResult(await backend.numbersSend(numbersSendSchema.strip().parse(input)));
        },
    }),
] as const;
const NUMBERS_OPERATIONS = operationValues(NUMBERS_TABLE);
export function registerNumbersTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(NUMBERS_OPERATIONS, ctx.policy.operationAllowlist?.get('numbers'));
    server.registerTool(
        'numbers',
        {
            description: operationDescription(NUMBERS_TABLE) + allowedValuesNote(values, NUMBERS_OPERATIONS),
            inputSchema: {
                operation: z.enum(NUMBERS_OPERATIONS),
                ...operationInput(NUMBERS_TABLE, NUMBERS_SHARED_FIELDS),
            },
        },
        async (input) => runOperation(NUMBERS_TABLE, input.operation, ctx, input),
    );
}
