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

export const MAILBOXES_INTRO = "Manage mailboxes, external inbox links and email messages.";
export const MAILBOXES_TABLE = [
    sdkOp('list', mailboxesListSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesList(params), 'read', { doc: "List owned mailboxes." }),
    sdkOp('capacity', z.object({}), (ctx, params) => ctx.backend.mailboxes.mailboxesCapacity(), 'read', { doc: "Read included mailbox capacity." }),
    operation({
        op: 'create',
        input: { ...mailboxesCreateSchema.partial().shape, billingPreference: MAILBOXES_SHARED_FIELDS.billingPreference, domainId: MAILBOXES_SHARED_FIELDS.domainId, label: MAILBOXES_SHARED_FIELDS.label, localPart: MAILBOXES_SHARED_FIELDS.localPart, clientRequestId: MAILBOXES_SHARED_FIELDS.clientRequestId },
        access: 'commerce',
        doc: "Create a mailbox; may start paid service.",
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
    sdkOp('get', mailboxesGetSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesGet(params), 'read', { doc: "Read a mailbox." }),
    sdkOp('update', mailboxesUpdateSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesUpdate(params), 'write', { doc: "Update the mailbox label." }),
    sdkOp('delete', mailboxesDeleteSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesDelete(params), 'commerce', { doc: "Cancel a pending mailbox or schedule paid cancellation." }),
    sdkOp('uncancel', mailboxesUncancelSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesUncancel(params), 'commerce', { doc: "Withdraw a scheduled cancellation and continue service." }),
    sdkOp('restart', mailboxesRestartSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesRestart(params), 'commerce', { doc: "Restart an archived mailbox; may start paid service." }),
    sdkOp('disconnect', mailboxesDisconnectSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesDisconnect(params), 'write', { doc: "Disconnect an external inbox link." }),
    sdkOp('otp', mailboxesOtpSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesOtp(params), 'read', { doc: "Read a recent email code; set after before requesting the code." }),
    sdkOp('messages', mailboxesMessagesSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesMessages(params), 'read', { doc: "Read recent email summaries." }),
    sdkOp('message', mailboxesMessageSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesMessage(params), 'read', { doc: "Read a single email with attachment metadata." }),
    sdkOp('connect', mailboxesConnectSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesConnect(params), 'write', { doc: "Link an external inbox; the user completes consent using the returned redirect URL." }),
    sdkOp('connection', mailboxesConnectionSchema, (ctx, params) => ctx.backend.mailboxes.mailboxesConnection(params), 'read', { doc: "Read the connection status after consent." }),
] as const;

export function registerMailboxesTools(server: McpServer, ctx: ToolCtx): void {
    
    registerBundle(server, ctx, 'mailboxes', MAILBOXES_TABLE, { intro: MAILBOXES_INTRO, shared: MAILBOXES_SHARED_FIELDS });
}
