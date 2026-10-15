import { z } from 'zod';

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
