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
const MAILBOXES_SHARED_FIELDS = {
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
    after: z.string().optional().describe('otp/messages: record this timestamp before requesting a fresh email code.'),
    maxLength: z.number().optional(),
    minLength: z.number().optional(),
    sender: z.string().optional(),
    cursor: z.string().optional(),
    hasOtp: z.boolean().optional(),
    limit: z.number().int().positive().max(100).optional(),
    messageId: z.string().optional().describe('Required for message. Opaque identifier from messages.'),
    bindingHash: z.string().optional(),
    connectionId: z.string().optional().describe('Required for connection. Identifier returned by connect.'),
};

export const MAILBOXES_TABLE = [
    sdkOp('list', mailboxesListSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesList(params), 'read', { describe: { order: 0, text: 'list: List owned mailboxes. ' } }),
    sdkOp('capacity', z.object({}), (ctx, params) => ctx.backend.mailboxes.mailboxesCapacity(), 'read', { describe: { order: 1, text: 'capacity: Read included mailbox capacity. ' } }),
    operation({
        op: 'create',
        input: { ...mailboxesCreateSchema.partial().shape, billingPreference: MAILBOXES_SHARED_FIELDS.billingPreference, domainId: MAILBOXES_SHARED_FIELDS.domainId, label: MAILBOXES_SHARED_FIELDS.label, localPart: MAILBOXES_SHARED_FIELDS.localPart, clientRequestId: MAILBOXES_SHARED_FIELDS.clientRequestId },
        access: 'commerce',
        describe: { order: 2, text: 'create: Create a mailbox; may start paid service. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(
                await awaitCheckoutUrl(
                    await backend.mailboxesCreate(mailboxesCreateSchema.strip().parse(input)),
                    'id',
                    (id) => backend.mailboxesGet({ mailboxId: id }),
                ),
            );
        },
    }),
    sdkOp('get', mailboxesGetSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesGet(params), 'read', { describe: { order: 3, text: 'get: Read a mailbox. ' } }),
    sdkOp('update', mailboxesUpdateSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesUpdate(params), 'write', { describe: { order: 4, text: 'update: Update the mailbox label. ' } }),
    sdkOp('delete', mailboxesDeleteSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesDelete(params), 'commerce', { describe: { order: 5, text: 'delete: Cancel a pending mailbox or schedule paid cancellation. ' } }),
    sdkOp('uncancel', mailboxesUncancelSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesUncancel(params), 'commerce', { describe: { order: 6, text: 'uncancel: Withdraw a scheduled cancellation and continue service. ' } }),
    sdkOp('restart', mailboxesRestartSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesRestart(params), 'commerce', { describe: { order: 7, text: 'restart: Restart an archived mailbox; may start paid service. ' } }),
    sdkOp('disconnect', mailboxesDisconnectSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesDisconnect(params), 'write', { describe: { order: 8, text: 'disconnect: Disconnect an external inbox link. ' } }),
    sdkOp('otp', mailboxesOtpSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesOtp(params), 'read', { describe: { order: 9, text: 'otp: Read a recent email code; set after before requesting the code. ' } }),
    sdkOp('messages', mailboxesMessagesSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesMessages(params), 'read', { describe: { order: 10, text: 'messages: Read recent email summaries. ' } }),
    sdkOp('message', mailboxesMessageSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesMessage(params), 'read', { describe: { order: 11, text: 'message: Read a single email with attachment metadata. ' } }),
    sdkOp('connect', mailboxesConnectSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesConnect(params), 'write', { describe: {
            order: 12,
            text: 'connect: Link an external inbox; the user completes consent using the returned redirect URL. ',
        } }),
    sdkOp('connection', mailboxesConnectionSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesConnection(params), 'read', { describe: { order: 13, text: 'connection: Read the connection status after consent.' } }),
] as const;

export function registerMailboxesTools(server: McpServer, ctx: ToolCtx): void {
    
    registerBundle(server, ctx, 'mailboxes', MAILBOXES_TABLE, { shared: MAILBOXES_SHARED_FIELDS });
}
