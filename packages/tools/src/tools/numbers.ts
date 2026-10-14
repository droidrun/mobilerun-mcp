import {
    operation,
    sdkOp,
    operationValues,
    operationInput,
    operationDescription,
    runOperation, registerBundle } from './operation-table.js';
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
    sdkOp('countries', z.object({}), (ctx, params) => ctx.backend.numbers.numbersCountries(), 'read', { describe: { order: 0, text: 'countries: List available countries and number availability. ' } }),
    sdkOp('capacity', numbersCapacitySchema, (ctx, params) => ctx.backend.numbers.numbersCapacity(params), 'read', { describe: { order: 1, text: 'capacity: Read included number capacity for a country. ' } }),
    sdkOp('list', numbersListSchema, (ctx, params) => ctx.backend.numbers.numbersList(params), 'read', { describe: { order: 2, text: 'list: List owned phone numbers. ' } }),
    sdkOp('get', numbersGetSchema, (ctx, params) => ctx.backend.numbers.numbersGet(params), 'read', { describe: { order: 3, text: 'get: Read one phone number. ' } }),
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
    sdkOp('update', numbersUpdateSchema, (ctx, params) => ctx.backend.numbers.numbersUpdate(params), 'write', { describe: { order: 5, text: 'update: Update the display label. ' } }),
    sdkOp('delete', numbersDeleteSchema, (ctx, params) => ctx.backend.numbers.numbersDelete(params), 'commerce', { describe: { order: 6, text: 'delete: Cancel a pending purchase or schedule cancellation of a paid number. ' } }),
    sdkOp('messages', numbersMessagesSchema, (ctx, params) => ctx.backend.numbers.numbersMessages(params), 'read', { describe: { order: 7, text: 'messages: Read SMS for one number, optionally filtered by direction or time. ' } }),
    sdkOp('send', numbersSendSchema, (ctx, params) => ctx.backend.numbers.numbersSend(params), 'commerce', { describe: { order: 8, text: 'send: Send an SMS from an active number; charges and limits may apply.' } }),
] as const;

export function registerNumbersTools(server: McpServer, ctx: ToolCtx): void {
    
    registerBundle(server, ctx, 'numbers', NUMBERS_TABLE, { shared: NUMBERS_SHARED_FIELDS });
}
