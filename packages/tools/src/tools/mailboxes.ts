import {
    type Operation,
    operationValues,
    selectInput,
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
const MAILBOXES_INPUT_FIELDS = {
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
type MailboxesInput = z.infer<z.ZodObject<typeof MAILBOXES_INPUT_FIELDS>> & {
    operation: string;
};
export const MAILBOXES_TABLE = [
    {
        op: 'list',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesListSchema.shape)]),
        readonly: true,
        billed: false,
        describe: { order: 0, text: 'list: List owned mailboxes. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesList(mailboxesListSchema.strip().parse(input)));
        },
    },
    {
        op: 'capacity',
        input: selectInput(MAILBOXES_INPUT_FIELDS, []),
        readonly: true,
        billed: false,
        describe: { order: 1, text: 'capacity: Read included mailbox capacity. ' },
        run: async (ctx, raw) => {
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesCapacity());
        },
    },
    {
        op: 'create',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesCreateSchema.shape)]),
        readonly: false,
        billed: true,
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
    },
    {
        op: 'get',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesGetSchema.shape)]),
        readonly: true,
        billed: false,
        describe: { order: 3, text: 'get: Read a mailbox. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesGet(mailboxesGetSchema.strip().parse(input)));
        },
    },
    {
        op: 'update',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesUpdateSchema.shape)]),
        readonly: false,
        billed: false,
        describe: { order: 4, text: 'update: Update the mailbox label. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesUpdate(mailboxesUpdateSchema.strip().parse(input)));
        },
    },
    {
        op: 'delete',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesDeleteSchema.shape)]),
        readonly: false,
        billed: true,
        describe: { order: 5, text: 'delete: Cancel a pending mailbox or schedule paid cancellation. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesDelete(mailboxesDeleteSchema.strip().parse(input)));
        },
    },
    {
        op: 'uncancel',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesUncancelSchema.shape)]),
        readonly: false,
        billed: true,
        describe: { order: 6, text: 'uncancel: Withdraw a scheduled cancellation and continue service. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesUncancel(mailboxesUncancelSchema.strip().parse(input)));
        },
    },
    {
        op: 'restart',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesRestartSchema.shape)]),
        readonly: false,
        billed: true,
        describe: { order: 7, text: 'restart: Restart an archived mailbox; may start paid service. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesRestart(mailboxesRestartSchema.strip().parse(input)));
        },
    },
    {
        op: 'disconnect',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesDisconnectSchema.shape)]),
        readonly: false,
        billed: false,
        describe: { order: 8, text: 'disconnect: Disconnect an external inbox link. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesDisconnect(mailboxesDisconnectSchema.strip().parse(input)));
        },
    },
    {
        op: 'otp',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesOtpSchema.shape)]),
        readonly: true,
        billed: false,
        describe: { order: 9, text: 'otp: Read a recent email code; set after before requesting the code. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesOtp(mailboxesOtpSchema.strip().parse(input)));
        },
    },
    {
        op: 'messages',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesMessagesSchema.shape)]),
        readonly: true,
        billed: false,
        describe: { order: 10, text: 'messages: Read recent email summaries. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesMessages(mailboxesMessagesSchema.strip().parse(input)));
        },
    },
    {
        op: 'message',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesMessageSchema.shape)]),
        readonly: true,
        billed: false,
        describe: { order: 11, text: 'message: Read a single email with attachment metadata. ' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesMessage(mailboxesMessageSchema.strip().parse(input)));
        },
    },
    {
        op: 'connect',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesConnectSchema.shape)]),
        readonly: false,
        billed: false,
        describe: {
            order: 12,
            text: 'connect: Link an external inbox; the user completes consent using the returned redirect URL. ',
        },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesConnect(mailboxesConnectSchema.strip().parse(input)));
        },
    },
    {
        op: 'connection',
        input: selectInput(MAILBOXES_INPUT_FIELDS, [...Object.keys(mailboxesConnectionSchema.shape)]),
        readonly: true,
        billed: false,
        describe: { order: 13, text: 'connection: Read the connection status after consent.' },
        run: async (ctx, raw) => {
            const { operation, ...input } = raw;
            const backend = ctx.backend.mailboxes;
            return asTextResult(await backend.mailboxesConnection(mailboxesConnectionSchema.strip().parse(input)));
        },
    },
] as const satisfies readonly Operation<MailboxesInput>[];
const MAILBOXES_OPERATIONS = operationValues(MAILBOXES_TABLE);
export function registerMailboxesTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MAILBOXES_OPERATIONS, ctx.policy.operationAllowlist?.get('mailboxes'));
    server.registerTool(
        'mailboxes',
        {
            description: operationDescription(MAILBOXES_TABLE) + allowedValuesNote(values, MAILBOXES_OPERATIONS),
            inputSchema: {
                operation: z.enum(MAILBOXES_OPERATIONS),
                ...operationInput(MAILBOXES_TABLE, MAILBOXES_INPUT_FIELDS),
            },
        },
        async (input) => runOperation(MAILBOXES_TABLE, input.operation, ctx, input),
    );
}
