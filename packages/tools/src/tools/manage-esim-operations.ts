import {
    manageEsimApnListSchema,
    manageEsimApnSelectSchema,
    manageEsimApnSetSchema,
    manageEsimSetRoamingSchema,
    manageEsimStatusSchema,
} from '../backend/device-control.js';
import { operation, requireValue, sdkOp } from './operation-table.js';

import { z } from 'zod';

import { asTextResult } from '../text-result.js';

export const MANAGE_ESIM_SHARED_FIELDS = {
    deviceId: z.string(),
    subId: z.number().int().optional(),
};

export const MANAGE_ESIM_INTRO = 'Manage eSIM subscriptions and connectivity.';
export const MANAGE_ESIM_TABLE = [
    operation({
        op: 'list',
        input: { deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: 'List eSIM subscriptions.',
        run: async (ctx, input) => asTextResult(await ctx.backend.deviceControl.listEsims(input.deviceId)),
    }),
    operation({
        op: 'activate',
        input: {
            enable: z.boolean().optional(),
            smDpAddr: z.string().optional(),
            confirmationCode: z.string().optional(),
            matchingId: z.string().optional(),
            deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId,
        },
        access: 'commerce',
        doc: 'Download an eSIM profile (smDpAddr required). enable controls whether to enable the downloaded profile. confirmationCode requires matchingId; these are only needed when the SM-DP+ challenges for a code.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.deviceControl.activateEsim(input.deviceId, {
                    enable: requireValue(input.enable, 'enable', input.operation),
                    smDpAddr: requireValue(input.smDpAddr, 'smDpAddr', input.operation),
                    confirmationCode: input.confirmationCode,
                    matchingId: input.matchingId,
                }),
            ),
    }),
    operation({
        op: 'enable',
        input: { subId: MANAGE_ESIM_SHARED_FIELDS.subId, deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: 'Enable subId.',
        run: async (ctx, input) => {
            const { deviceId } = input;

            const subId = requireValue(input.subId, 'subId', input.operation);
            await ctx.backend.deviceControl.enableEsim(deviceId, subId);
            return asTextResult({ status: 'ok', operation: input.operation, deviceId, subId });
        },
    }),
    operation({
        op: 'remove',
        input: { subId: MANAGE_ESIM_SHARED_FIELDS.subId, deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId },
        access: 'write',
        destructive: true,
        doc: 'Remove subId.',
        run: async (ctx, input) => {
            const { deviceId } = input;

            const subId = requireValue(input.subId, 'subId', input.operation);
            await ctx.backend.deviceControl.removeEsim(deviceId, subId);
            return asTextResult({ status: 'ok', operation: input.operation, deviceId, subId });
        },
    }),
    sdkOp(
        'set_roaming',
        manageEsimSetRoamingSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageEsimSetRoaming(deviceId, params),
        'write',
        { doc: 'Enable or disable eSIM roaming.', deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'status',
        manageEsimStatusSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageEsimStatus(deviceId, params),
        'read',
        { doc: 'Read eSIM connectivity status.', deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'apn_list',
        manageEsimApnListSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageEsimApnList(deviceId, params),
        'read',
        { doc: 'List available access point settings.', deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'apn_select',
        manageEsimApnSelectSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageEsimApnSelect(deviceId, params),
        'write',
        { doc: 'Select an access point.', deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'apn_set',
        manageEsimApnSetSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageEsimApnSet(deviceId, params),
        'write',
        { doc: 'Set access point settings.', deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId },
    ),
] as const;
