import { z } from 'zod';

export const clientRequestIdSchema = z.string().min(1).max(128).regex(/^[\x21-\x7E]+$/).optional();

export const billingPreferenceSchema = z.enum(['included', 'included_only', 'rent']);
export const smsDirectionSchema = z.enum(['all', 'inbound', 'outbound']);
export const smsStatusSchema = z.enum([
    'all',
    'received',
    'queued',
    'claimed',
    'sending',
    'sent',
    'sent_unconfirmed',
    'delivered',
    'failed',
]);
