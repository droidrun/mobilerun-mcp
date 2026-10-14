import { awaitCheckoutUrl } from './checkout.js';
import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { billingPreferenceSchema } from '../backend/communication.js';
import {
    mailboxesListSchema,
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
import { type ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

export const MAILBOXES_OPERATIONS = [
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
    const values = narrowedValues(MAILBOXES_OPERATIONS, ctx.policy.operationAllowlist?.get('mailboxes'));
    server.registerTool(
        'mailboxes',
        {
            description:
                'list: List owned mailboxes. capacity: Read included mailbox capacity. create: Create a mailbox; may start paid service. get: Read a mailbox. update: Update the mailbox label. delete: Cancel a pending mailbox or schedule paid cancellation. uncancel: Withdraw a scheduled cancellation and continue service. restart: Restart an archived mailbox; may start paid service. disconnect: Disconnect an external inbox link. otp: Read a recent email code; set after before requesting the code. messages: Read recent email summaries. message: Read a single email with attachment metadata. connect: Link an external inbox; the user completes consent using the returned redirect URL. connection: Read the connection status after consent.' +
                allowedValuesNote(values, MAILBOXES_OPERATIONS),
            inputSchema: {
                operation: z.enum(MAILBOXES_OPERATIONS),
                page: z.number().int().positive().optional(),
                pageSize: z.number().int().positive().max(100).optional(),
                billingPreference: billingPreferenceSchema
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
                    return asTextResult(await backend.mailboxesList(mailboxesListSchema.strip().parse(input)));
                case 'capacity':
                    return asTextResult(await backend.mailboxesCapacity());
                case 'create':
                    return asTextResult(
                        await awaitCheckoutUrl(
                            await backend.mailboxesCreate(mailboxesCreateSchema.strip().parse(input)),
                            'id',
                            (id) => backend.mailboxesGet({ mailboxId: id }),
                        ),
                    );
                case 'get':
                    return asTextResult(await backend.mailboxesGet(mailboxesGetSchema.strip().parse(input)));
                case 'update':
                    return asTextResult(await backend.mailboxesUpdate(mailboxesUpdateSchema.strip().parse(input)));
                case 'delete':
                    return asTextResult(await backend.mailboxesDelete(mailboxesDeleteSchema.strip().parse(input)));
                case 'uncancel':
                    return asTextResult(await backend.mailboxesUncancel(mailboxesUncancelSchema.strip().parse(input)));
                case 'restart':
                    return asTextResult(await backend.mailboxesRestart(mailboxesRestartSchema.strip().parse(input)));
                case 'disconnect':
                    return asTextResult(
                        await backend.mailboxesDisconnect(mailboxesDisconnectSchema.strip().parse(input)),
                    );
                case 'otp':
                    return asTextResult(await backend.mailboxesOtp(mailboxesOtpSchema.strip().parse(input)));
                case 'messages':
                    return asTextResult(await backend.mailboxesMessages(mailboxesMessagesSchema.strip().parse(input)));
                case 'message':
                    return asTextResult(await backend.mailboxesMessage(mailboxesMessageSchema.strip().parse(input)));
                case 'connect':
                    return asTextResult(await backend.mailboxesConnect(mailboxesConnectSchema.strip().parse(input)));
                case 'connection':
                    return asTextResult(
                        await backend.mailboxesConnection(mailboxesConnectionSchema.strip().parse(input)),
                    );
            }
        },
    );
}
