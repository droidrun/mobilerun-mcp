import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
    numbersCapacitySchema,
    numbersCreateSchema,
    numbersDeleteSchema,
    numbersGetSchema,
    numbersListSchema,
    numbersMessagesSchema,
    numbersSendSchema,
    numbersUpdateSchema,
} from '../backend/numbers.js';
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { awaitCheckoutUrl } from './checkout.js';
import { operation, registerBundle, sdkOp } from './operation-table.js';
const NUMBERS_SHARED_FIELDS = {
    country: z.string().optional().describe('Country code from countries. Required for capacity.'),
    numberId: z.string().optional().describe('Required for get/update/delete/messages/send.'),
    clientRequestId: z.string().min(1).max(128).optional().describe('Optional stable purchase request key; reuse it for retries.'),
    body: z.string().optional().describe('Required SMS text for send.'),
    to: z.string().optional().describe('Required destination phone number for send.'),
};

const NUMBERS_INTRO = 'Manage phone numbers and SMS.';
export const NUMBERS_TABLE = [
    sdkOp('countries', z.object({}), (ctx) => ctx.backend.numbers.numbersCountries(), 'read', {
        doc: 'List available countries and number availability.',
    }),
    sdkOp('capacity', numbersCapacitySchema, (ctx, params) => ctx.backend.numbers.numbersCapacity(params), 'read', {
        doc: 'Read included number capacity for a country.',
    }),
    sdkOp('list', numbersListSchema, (ctx, params) => ctx.backend.numbers.numbersList(params), 'read', {
        doc: 'List owned phone numbers.',
    }),
    sdkOp('get', numbersGetSchema, (ctx, params) => ctx.backend.numbers.numbersGet(params), 'read', {
        doc: 'Read one phone number.',
    }),
    operation({
        op: 'create',
        input: {
            ...numbersCreateSchema.partial().shape,
            country: NUMBERS_SHARED_FIELDS.country,
            clientRequestId: NUMBERS_SHARED_FIELDS.clientRequestId,
        },
        access: 'commerce',
        doc: 'Create a phone number. billingPreference: included uses included capacity then falls back to rent; included_only fails when included capacity is exhausted; rent always starts paid service. Omit it for the API default. Poll get for status.',
        run: async (ctx, raw) => {
            const input = raw;

            return asTextResult(
                await awaitCheckoutUrl(
                    await ctx.backend.numbers.numbersCreate(numbersCreateSchema.strip().parse(input)),
                    'numberId',
                    (id) => ctx.backend.numbers.numbersGet({ numberId: id }),
                ),
            );
        },
    }),
    sdkOp('update', numbersUpdateSchema, (ctx, params) => ctx.backend.numbers.numbersUpdate(params), 'write', {
        doc: 'Update the display label.',
    }),
    sdkOp('delete', numbersDeleteSchema, (ctx, params) => ctx.backend.numbers.numbersDelete(params), 'commerce', {
        doc: 'Cancel a pending purchase or schedule cancellation of a paid number.',
    }),
    sdkOp('messages', numbersMessagesSchema, (ctx, params) => ctx.backend.numbers.numbersMessages(params), 'read', {
        doc: 'Read SMS for one number, optionally filtered by direction or time.',
    }),
    sdkOp('send', numbersSendSchema, (ctx, params) => ctx.backend.numbers.numbersSend(params), 'commerce', {
        doc: 'Send an SMS from an active number; charges and limits may apply.',
    }),
] as const;

export function registerNumbersTools(server: McpServer, ctx: ToolCtx): void {
    registerBundle(server, ctx, 'numbers', NUMBERS_TABLE, { intro: NUMBERS_INTRO, shared: NUMBERS_SHARED_FIELDS });
}
