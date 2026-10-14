import { z } from 'zod';
import { billingPreferenceSchema } from './communication.js';

export const mailboxesListSchema = z
    .object({
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
    })
    .strict();

export const mailboxesCapacitySchema = z.object({}).strict();

export const mailboxesCreateSchema = z
    .object({
        billingPreference: billingPreferenceSchema.optional(),
        domainId: z.string().optional(),
        label: z.string().nullable().optional(),
        localPart: z.string().optional(),
        clientRequestId: z.string().min(1).max(128).optional(),
    })
    .strict();

export const mailboxesGetSchema = z
    .object({
        mailboxId: z.string(),
    })
    .strict();

export const mailboxesUpdateSchema = z
    .object({
        mailboxId: z.string(),
        label: z.union([z.string(), z.null()]),
    })
    .strict();

export const mailboxesDeleteSchema = z
    .object({
        mailboxId: z.string(),
    })
    .strict();

export const mailboxesUncancelSchema = z
    .object({
        mailboxId: z.string(),
    })
    .strict();

export const mailboxesRestartSchema = z
    .object({
        mailboxId: z.string(),
        billingPreference: billingPreferenceSchema.optional(),
    })
    .strict();

export const mailboxesDisconnectSchema = z
    .object({
        mailboxId: z.string(),
    })
    .strict();

export const mailboxesOtpSchema = z
    .object({
        mailboxId: z.string(),
        after: z.string().optional(),
        maxLength: z.number().optional(),
        minLength: z.number().optional(),
        sender: z.string().optional(),
    })
    .strict();

export const mailboxesMessagesSchema = z
    .object({
        mailboxId: z.string(),
        after: z.string().optional(),
        cursor: z.string().optional(),
        hasOtp: z.boolean().optional(),
        limit: z.number().int().positive().max(100).optional(),
        sender: z.string().optional(),
    })
    .strict();

export const mailboxesMessageSchema = z
    .object({
        messageId: z.string(),
        mailboxId: z.string(),
    })
    .strict();

export const mailboxesConnectSchema = z
    .object({
        bindingHash: z.string().optional(),
        label: z.string().optional(),
        clientRequestId: z.string().min(1).max(128).optional(),
    })
    .strict();

export const mailboxesConnectionSchema = z
    .object({
        connectionId: z.string(),
    })
    .strict();

export interface MailboxesBackend {
    mailboxesList(params: z.infer<typeof mailboxesListSchema>): Promise<unknown>;
    mailboxesCapacity(): Promise<unknown>;
    mailboxesCreate(params: z.infer<typeof mailboxesCreateSchema>): Promise<unknown>;
    mailboxesGet(params: z.infer<typeof mailboxesGetSchema>): Promise<unknown>;
    mailboxesUpdate(params: z.infer<typeof mailboxesUpdateSchema>): Promise<unknown>;
    mailboxesDelete(params: z.infer<typeof mailboxesDeleteSchema>): Promise<unknown>;
    mailboxesUncancel(params: z.infer<typeof mailboxesUncancelSchema>): Promise<unknown>;
    mailboxesRestart(params: z.infer<typeof mailboxesRestartSchema>): Promise<unknown>;
    mailboxesDisconnect(params: z.infer<typeof mailboxesDisconnectSchema>): Promise<unknown>;
    mailboxesOtp(params: z.infer<typeof mailboxesOtpSchema>): Promise<unknown>;
    mailboxesMessages(params: z.infer<typeof mailboxesMessagesSchema>): Promise<unknown>;
    mailboxesMessage(params: z.infer<typeof mailboxesMessageSchema>): Promise<unknown>;
    mailboxesConnect(params: z.infer<typeof mailboxesConnectSchema>): Promise<unknown>;
    mailboxesConnection(params: z.infer<typeof mailboxesConnectionSchema>): Promise<unknown>;
}
