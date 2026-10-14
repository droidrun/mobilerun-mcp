import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
    numbersCountriesSchema,
    numbersCapacitySchema,
    numbersListSchema,
    numbersGetSchema,
    numbersCreateSchema,
    numbersUpdateSchema,
    numbersDeleteSchema,
    numbersMessagesSchema,
    numbersSendSchema,
} from '../backend/numbers.js';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

const OPERATIONS = ['countries', 'capacity', 'list', 'get', 'create', 'update', 'delete', 'messages', 'send'] as const;

export function registerNumbersTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(OPERATIONS, ctx.policy.operationAllowlist?.get('numbers'));
    server.registerTool(
        'numbers',
        {
            description:
                'countries: List available countries and number availability. capacity: Read included number capacity for a country. list: List owned phone numbers. get: Read one phone number. create: Start a paid phone-number purchase; poll get for status. update: Update the display label. delete: Cancel a pending purchase or schedule cancellation of a paid number. messages: Read SMS for one number, optionally filtered by direction or time. send: Send an SMS from an active number; charges and limits may apply.' +
                allowedValuesNote(values, OPERATIONS),
            inputSchema: {
                operation: z.enum(OPERATIONS),
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
                direction: z.union([z.literal('all'), z.literal('inbound'), z.literal('outbound')]).optional(),
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
                    return asTextResult(
                        await backend.numbersCountries(
                            numbersCountriesSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ([] as string[]).includes(key)),
                                ),
                            ),
                        ),
                    );
                case 'capacity':
                    return asTextResult(
                        await backend.numbersCapacity(
                            numbersCapacitySchema.parse(
                                Object.fromEntries(Object.entries(input).filter(([key]) => ['country'].includes(key))),
                            ),
                        ),
                    );
                case 'list':
                    return asTextResult(
                        await backend.numbersList(
                            numbersListSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ['page', 'pageSize'].includes(key)),
                                ),
                            ),
                        ),
                    );
                case 'get':
                    return asTextResult(
                        await backend.numbersGet(
                            numbersGetSchema.parse(
                                Object.fromEntries(Object.entries(input).filter(([key]) => ['numberId'].includes(key))),
                            ),
                        ),
                    );
                case 'create':
                    return asTextResult(
                        await backend.numbersCreate(
                            numbersCreateSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) =>
                                        ['country', 'label', 'clientRequestId'].includes(key),
                                    ),
                                ),
                            ),
                        ),
                    );
                case 'update':
                    return asTextResult(
                        await backend.numbersUpdate(
                            numbersUpdateSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ['numberId', 'label'].includes(key)),
                                ),
                            ),
                        ),
                    );
                case 'delete':
                    return asTextResult(
                        await backend.numbersDelete(
                            numbersDeleteSchema.parse(
                                Object.fromEntries(Object.entries(input).filter(([key]) => ['numberId'].includes(key))),
                            ),
                        ),
                    );
                case 'messages':
                    return asTextResult(
                        await backend.numbersMessages(
                            numbersMessagesSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) =>
                                        ['numberId', 'direction', 'page', 'pageSize', 'since'].includes(key),
                                    ),
                                ),
                            ),
                        ),
                    );
                case 'send':
                    return asTextResult(
                        await backend.numbersSend(
                            numbersSendSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) =>
                                        ['numberId', 'body', 'to', 'deliveryReport'].includes(key),
                                    ),
                                ),
                            ),
                        ),
                    );
            }
        },
    );
}
