import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
    mailboxesListSchema,
    mailboxesCapacitySchema,
    mailboxesCreateSchema,
    mailboxesGetSchema,
    mailboxesUpdateSchema,
    mailboxesDeleteSchema,
    mailboxesUncancelSchema,
    mailboxesRestartSchema,
    mailboxesDisconnectSchema,
    mailboxesOtpSchema,
    mailboxesMessagesSchema,
    mailboxesMessageSchema,
    mailboxesConnectSchema,
    mailboxesConnectionSchema,
} from '../backend/mailboxes.js';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

const OPERATIONS = [
    'list',
    'capacity',
    'create',
    'get',
    'update',
    'delete',
    'uncancel',
    'restart',
    'disconnect',
    'otp',
    'messages',
    'message',
    'connect',
    'connection',
] as const;

export function registerMailboxesTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(OPERATIONS, ctx.policy.operationAllowlist?.get('mailboxes'));
    server.registerTool(
        'mailboxes',
        {
            description:
                'list: List owned mailboxes. capacity: Read included mailbox capacity. create: Create a mailbox; may start paid service. get: Read a mailbox. update: Update the mailbox label. delete: Cancel a pending mailbox or schedule paid cancellation. uncancel: Withdraw a scheduled cancellation and continue service. restart: Restart an archived mailbox; may start paid service. disconnect: Disconnect an external inbox link. otp: Read a recent email code; set after before requesting the code. messages: Read recent email summaries. message: Read a single email with attachment metadata. connect: Link an external inbox; the user completes consent using the returned redirect URL. connection: Read the connection status after consent.' +
                allowedValuesNote(values, OPERATIONS),
            inputSchema: {
                operation: z.enum(OPERATIONS),
                page: z.number().int().positive().optional(),
                pageSize: z.number().int().positive().max(100).optional(),
                billingPreference: z
                    .union([z.literal('included'), z.literal('included_only'), z.literal('rent')])
                    .optional()
                    .describe(
                        'create/restart: included may fall back to paid service; included_only refuses paid fallback; rent requests paid service.',
                    ),
                domainId: z.string().optional(),
                label: z.string().nullable().optional(),
                localPart: z.string().optional(),
                clientRequestId: z
                    .string()
                    .min(1)
                    .max(128)
                    .optional()
                    .describe('Optional stable request key for create/connect retries.'),
                mailboxId: z
                    .string()
                    .optional()
                    .describe('Required for get/update/delete/uncancel/restart/disconnect/otp/messages/message.'),
                after: z
                    .string()
                    .optional()
                    .describe('otp/messages: record this timestamp before requesting a fresh email code.'),
                maxLength: z.number().optional(),
                minLength: z.number().optional(),
                sender: z.string().optional(),
                cursor: z.string().optional(),
                hasOtp: z.boolean().optional(),
                limit: z.number().int().positive().max(100).optional(),
                messageId: z.string().optional().describe('Required for message. Opaque identifier from messages.'),
                bindingHash: z.string().optional(),
                connectionId: z
                    .string()
                    .optional()
                    .describe('Required for connection. Identifier returned by connect.'),
            },
        },
        async ({ operation, ...input }) => {
            const backend = ctx.backend.mailboxes;
            switch (operation) {
                case 'list':
                    return asTextResult(
                        await backend.mailboxesList(
                            mailboxesListSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ['page', 'pageSize'].includes(key)),
                                ),
                            ),
                        ),
                    );
                case 'capacity':
                    return asTextResult(
                        await backend.mailboxesCapacity(
                            mailboxesCapacitySchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ([] as string[]).includes(key)),
                                ),
                            ),
                        ),
                    );
                case 'create':
                    return asTextResult(
                        await backend.mailboxesCreate(
                            mailboxesCreateSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) =>
                                        [
                                            'billingPreference',
                                            'domainId',
                                            'label',
                                            'localPart',
                                            'clientRequestId',
                                        ].includes(key),
                                    ),
                                ),
                            ),
                        ),
                    );
                case 'get':
                    return asTextResult(
                        await backend.mailboxesGet(
                            mailboxesGetSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ['mailboxId'].includes(key)),
                                ),
                            ),
                        ),
                    );
                case 'update':
                    return asTextResult(
                        await backend.mailboxesUpdate(
                            mailboxesUpdateSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ['mailboxId', 'label'].includes(key)),
                                ),
                            ),
                        ),
                    );
                case 'delete':
                    return asTextResult(
                        await backend.mailboxesDelete(
                            mailboxesDeleteSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ['mailboxId'].includes(key)),
                                ),
                            ),
                        ),
                    );
                case 'uncancel':
                    return asTextResult(
                        await backend.mailboxesUncancel(
                            mailboxesUncancelSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ['mailboxId'].includes(key)),
                                ),
                            ),
                        ),
                    );
                case 'restart':
                    return asTextResult(
                        await backend.mailboxesRestart(
                            mailboxesRestartSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) =>
                                        ['mailboxId', 'billingPreference'].includes(key),
                                    ),
                                ),
                            ),
                        ),
                    );
                case 'disconnect':
                    return asTextResult(
                        await backend.mailboxesDisconnect(
                            mailboxesDisconnectSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ['mailboxId'].includes(key)),
                                ),
                            ),
                        ),
                    );
                case 'otp':
                    return asTextResult(
                        await backend.mailboxesOtp(
                            mailboxesOtpSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) =>
                                        ['mailboxId', 'after', 'maxLength', 'minLength', 'sender'].includes(key),
                                    ),
                                ),
                            ),
                        ),
                    );
                case 'messages':
                    return asTextResult(
                        await backend.mailboxesMessages(
                            mailboxesMessagesSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) =>
                                        ['mailboxId', 'after', 'cursor', 'hasOtp', 'limit', 'sender'].includes(key),
                                    ),
                                ),
                            ),
                        ),
                    );
                case 'message':
                    return asTextResult(
                        await backend.mailboxesMessage(
                            mailboxesMessageSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ['messageId', 'mailboxId'].includes(key)),
                                ),
                            ),
                        ),
                    );
                case 'connect':
                    return asTextResult(
                        await backend.mailboxesConnect(
                            mailboxesConnectSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) =>
                                        ['bindingHash', 'label', 'clientRequestId'].includes(key),
                                    ),
                                ),
                            ),
                        ),
                    );
                case 'connection':
                    return asTextResult(
                        await backend.mailboxesConnection(
                            mailboxesConnectionSchema.parse(
                                Object.fromEntries(
                                    Object.entries(input).filter(([key]) => ['connectionId'].includes(key)),
                                ),
                            ),
                        ),
                    );
            }
        },
    );
}
