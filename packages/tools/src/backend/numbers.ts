import { z } from 'zod';
import { smsDirectionSchema, billingPreferenceSchema } from './communication.js';

export const numbersCapacitySchema = z
    .object({
        country: z.string(),
    })
    .strict();

export const numbersListSchema = z
    .object({
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
    })
    .strict();

export const numbersGetSchema = z
    .object({
        numberId: z.string(),
    })
    .strict();

export const numbersCreateSchema = z
    .object({
        billingPreference: billingPreferenceSchema.optional(),
        country: z.string().optional(),
        label: z.union([z.string(), z.null()]).optional(),
        clientRequestId: z.string().min(1).max(128).optional(),
    })
    .strict();

export const numbersUpdateSchema = z
    .object({
        numberId: z.string(),
        label: z.union([z.string(), z.null()]).optional(),
    })
    .strict();

export const numbersDeleteSchema = z
    .object({
        numberId: z.string(),
    })
    .strict();

export const numbersMessagesSchema = z
    .object({
        numberId: z.string(),
        direction: smsDirectionSchema.optional(),
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
        since: z.string().optional(),
    })
    .strict();

export const numbersSendSchema = z
    .object({
        numberId: z.string(),
        body: z.string(),
        to: z.string(),
        deliveryReport: z.boolean().optional(),
    })
    .strict();

export interface NumbersBackend {
    numbersCountries(): Promise<unknown>;
    numbersCapacity(params: z.infer<typeof numbersCapacitySchema>): Promise<unknown>;
    numbersList(params: z.infer<typeof numbersListSchema>): Promise<unknown>;
    numbersGet(params: z.infer<typeof numbersGetSchema>): Promise<unknown>;
    numbersCreate(params: z.infer<typeof numbersCreateSchema>): Promise<unknown>;
    numbersUpdate(params: z.infer<typeof numbersUpdateSchema>): Promise<unknown>;
    numbersDelete(params: z.infer<typeof numbersDeleteSchema>): Promise<unknown>;
    numbersMessages(params: z.infer<typeof numbersMessagesSchema>): Promise<unknown>;
    numbersSend(params: z.infer<typeof numbersSendSchema>): Promise<unknown>;
}
