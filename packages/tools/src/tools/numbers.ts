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

export const NUMBERS_OPERATIONS = [
    'countries',
    'capacity',
    'list',
    'get',
    'create',
    'update',
    'delete',
    'messages',
    'send',
] as const;

export function registerNumbersTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(NUMBERS_OPERATIONS, ctx.policy.operationAllowlist?.get('numbers'));
    server.registerTool(
        'numbers',
        {
            description:
                'countries: List available countries and number availability. capacity: Read included number capacity for a country. list: List owned phone numbers. get: Read one phone number. create: Create a phone number. billingPreference: included uses included capacity then falls back to rent; included_only fails when included capacity is exhausted; rent always starts paid service. Omit it for the API default. Poll get for status. update: Update the display label. delete: Cancel a pending purchase or schedule cancellation of a paid number. messages: Read SMS for one number, optionally filtered by direction or time. send: Send an SMS from an active number; charges and limits may apply.' +
                allowedValuesNote(values, NUMBERS_OPERATIONS),
            inputSchema: {
                operation: z.enum(NUMBERS_OPERATIONS),
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
            },
        },
        async ({ operation, ...input }) => {
            const backend = ctx.backend.numbers;
            switch (operation) {
                case 'countries':
                    return asTextResult(await backend.numbersCountries());
                case 'capacity':
                    return asTextResult(await backend.numbersCapacity(numbersCapacitySchema.strip().parse(input)));
                case 'list':
                    return asTextResult(await backend.numbersList(numbersListSchema.strip().parse(input)));
                case 'get':
                    return asTextResult(await backend.numbersGet(numbersGetSchema.strip().parse(input)));
                case 'create':
                    return asTextResult(
                        await awaitCheckoutUrl(
                            await backend.numbersCreate(numbersCreateSchema.strip().parse(input)),
                            'numberId',
                            (id) => backend.numbersGet({ numberId: id }),
                        ),
                    );
                case 'update':
                    return asTextResult(await backend.numbersUpdate(numbersUpdateSchema.strip().parse(input)));
                case 'delete':
                    return asTextResult(await backend.numbersDelete(numbersDeleteSchema.strip().parse(input)));
                case 'messages':
                    return asTextResult(await backend.numbersMessages(numbersMessagesSchema.strip().parse(input)));
                case 'send':
                    return asTextResult(await backend.numbersSend(numbersSendSchema.strip().parse(input)));
            }
        },
    );
}
