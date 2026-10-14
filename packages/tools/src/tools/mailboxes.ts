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
    operation({
        op: 'list',
        input: { ...mailboxesListSchema.partial().shape, page: MAILBOXES_SHARED_FIELDS.page, pageSize: MAILBOXES_SHARED_FIELDS.pageSize },
        access: 'read',
        describe: { order: 0, text: 'list: List owned mailboxes. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesList(mailboxesListSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'capacity',
        input: {  },
        access: 'read',
        describe: { order: 1, text: 'capacity: Read included mailbox capacity. ' },
        run: async (ctx, raw) => {
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesCapacity());
        },
    }),
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
    operation({
        op: 'get',
        input: { ...mailboxesGetSchema.partial().shape, mailboxId: MAILBOXES_SHARED_FIELDS.mailboxId },
        access: 'read',
        describe: { order: 3, text: 'get: Read a mailbox. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesGet(mailboxesGetSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'update',
        input: { ...mailboxesUpdateSchema.partial().shape, mailboxId: MAILBOXES_SHARED_FIELDS.mailboxId, label: MAILBOXES_SHARED_FIELDS.label },
        access: 'write',
        describe: { order: 4, text: 'update: Update the mailbox label. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesUpdate(mailboxesUpdateSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'delete',
        input: { ...mailboxesDeleteSchema.partial().shape, mailboxId: MAILBOXES_SHARED_FIELDS.mailboxId },
        access: 'commerce',
        describe: { order: 5, text: 'delete: Cancel a pending mailbox or schedule paid cancellation. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesDelete(mailboxesDeleteSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'uncancel',
        input: { ...mailboxesUncancelSchema.partial().shape, mailboxId: MAILBOXES_SHARED_FIELDS.mailboxId },
        access: 'commerce',
        describe: { order: 6, text: 'uncancel: Withdraw a scheduled cancellation and continue service. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesUncancel(mailboxesUncancelSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'restart',
        input: { ...mailboxesRestartSchema.partial().shape, mailboxId: MAILBOXES_SHARED_FIELDS.mailboxId, billingPreference: MAILBOXES_SHARED_FIELDS.billingPreference },
        access: 'commerce',
        describe: { order: 7, text: 'restart: Restart an archived mailbox; may start paid service. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesRestart(mailboxesRestartSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'disconnect',
        input: { ...mailboxesDisconnectSchema.partial().shape, mailboxId: MAILBOXES_SHARED_FIELDS.mailboxId },
        access: 'write',
        describe: { order: 8, text: 'disconnect: Disconnect an external inbox link. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesDisconnect(mailboxesDisconnectSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'otp',
        input: { ...mailboxesOtpSchema.partial().shape, mailboxId: MAILBOXES_SHARED_FIELDS.mailboxId, after: MAILBOXES_SHARED_FIELDS.after, maxLength: MAILBOXES_SHARED_FIELDS.maxLength, minLength: MAILBOXES_SHARED_FIELDS.minLength, sender: MAILBOXES_SHARED_FIELDS.sender },
        access: 'read',
        describe: { order: 9, text: 'otp: Read a recent email code; set after before requesting the code. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesOtp(mailboxesOtpSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'messages',
        input: { ...mailboxesMessagesSchema.partial().shape, mailboxId: MAILBOXES_SHARED_FIELDS.mailboxId, after: MAILBOXES_SHARED_FIELDS.after, cursor: MAILBOXES_SHARED_FIELDS.cursor, hasOtp: MAILBOXES_SHARED_FIELDS.hasOtp, limit: MAILBOXES_SHARED_FIELDS.limit, sender: MAILBOXES_SHARED_FIELDS.sender },
        access: 'read',
        describe: { order: 10, text: 'messages: Read recent email summaries. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesMessages(mailboxesMessagesSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'message',
        input: { ...mailboxesMessageSchema.partial().shape, messageId: MAILBOXES_SHARED_FIELDS.messageId, mailboxId: MAILBOXES_SHARED_FIELDS.mailboxId },
        access: 'read',
        describe: { order: 11, text: 'message: Read a single email with attachment metadata. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesMessage(mailboxesMessageSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'connect',
        input: { ...mailboxesConnectSchema.partial().shape, bindingHash: MAILBOXES_SHARED_FIELDS.bindingHash, label: MAILBOXES_SHARED_FIELDS.label, clientRequestId: MAILBOXES_SHARED_FIELDS.clientRequestId },
        access: 'write',
        describe: {
            order: 12,
            text: 'connect: Link an external inbox; the user completes consent using the returned redirect URL. ',
        },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesConnect(mailboxesConnectSchema.strip().parse(input)));
        },
    }),
    operation({
        op: 'connection',
        input: { ...mailboxesConnectionSchema.partial().shape, connectionId: MAILBOXES_SHARED_FIELDS.connectionId },
        access: 'read',
        describe: { order: 13, text: 'connection: Read the connection status after consent.' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesConnection(mailboxesConnectionSchema.strip().parse(input)));
        },
    }),
] as const;
const MAILBOXES_OPERATIONS = operationValues(MAILBOXES_TABLE);
export function registerMailboxesTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MAILBOXES_OPERATIONS, ctx.policy.operationAllowlist?.get('mailboxes'));
    server.registerTool(
        'mailboxes',
        {
            description: operationDescription(MAILBOXES_TABLE) + allowedValuesNote(values, MAILBOXES_OPERATIONS),
            inputSchema: {
                operation: z.enum(MAILBOXES_OPERATIONS),
                ...operationInput(MAILBOXES_TABLE, MAILBOXES_SHARED_FIELDS),
            },
        },
        async (input) => runOperation(MAILBOXES_TABLE, input.operation, ctx, input),
    );
}
