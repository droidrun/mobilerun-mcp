import { operation, sdkOp } from './operation-table.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { requireValue } from './op-helpers.js';
import {
    manageEsimSetRoamingSchema,
    manageEsimStatusSchema,
    manageEsimApnListSchema,
    manageEsimApnSelectSchema,
    manageEsimApnSetSchema,
} from '../backend/device-control.js';

import { z } from 'zod';

import { asTextResult } from '../text-result.js';

export const MANAGE_ESIM_SHARED_FIELDS = {
    deviceId: z.string(),
    subId: z.number().int().optional(),
};



export const MANAGE_ESIM_TABLE = [
    operation({
        op: 'list',
        input: { deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId },
        fieldOrder: 5,
        access: 'read',
        describe: { order: 0, text: 'eSIM subscription management. Operations: list, ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.listEsims(deviceId));
        },
    }),
    operation({
        op: 'activate',
        input: { enable: z.boolean().optional(), smDpAddr: z.string().optional(), confirmationCode: z.string().optional(), matchingId: z.string().optional(), deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId },
        fieldOrder: 6,
        access: 'commerce',
        describe: { order: 1, text: 'activate (smDpAddr required, ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(
                await backend.activateEsim(deviceId, {
                    enable: requireValue(input.enable as boolean | undefined, 'enable', operation),
                    smDpAddr: requireValue(input.smDpAddr as string | undefined, 'smDpAddr', operation),
                    confirmationCode: input.confirmationCode as string | undefined,
                    matchingId: input.matchingId as string | undefined,
                }),
            );
        },
    }),
    operation({
        op: 'enable',
        input: { subId: MANAGE_ESIM_SHARED_FIELDS.subId, deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId },
        fieldOrder: 7,
        access: 'write',
        describe: {
            order: 2,
            text: 'enable: whether to also enable the downloaded profile, confirmationCode?/matchingId? — confirmationCode requires matchingId, only needed when the SM-DP+ challenges for it), enable (subId), ',
        },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const subId = requireValue(input.subId as number | undefined, 'subId', operation);
            await backend.enableEsim(deviceId, subId);
            return asTextResult({ status: 'ok', operation, deviceId, subId });
        },
    }),
    operation({
        op: 'remove',
        input: { subId: MANAGE_ESIM_SHARED_FIELDS.subId, deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId },
        fieldOrder: 8,
        access: 'write',
        describe: { order: 3, text: 'remove (subId). Additional operations: ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const subId = requireValue(input.subId as number | undefined, 'subId', operation);
            await backend.removeEsim(deviceId, subId);
            return asTextResult({ status: 'ok', operation, deviceId, subId });
        },
    }),
    sdkOp('set_roaming', manageEsimSetRoamingSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageEsimSetRoaming(deviceId, params), 'write', { fieldOrder: 0, describe: { order: 4, text: 'set_roaming: Enable or disable eSIM roaming. ' }, deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId }),
    sdkOp('status', manageEsimStatusSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageEsimStatus(deviceId, params), 'read', { fieldOrder: 1, describe: { order: 5, text: 'status: Read eSIM connectivity status. ' }, deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId }),
    sdkOp('apn_list', manageEsimApnListSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageEsimApnList(deviceId, params), 'read', { fieldOrder: 2, describe: { order: 6, text: 'apn_list: List available access point settings. ' }, deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId }),
    sdkOp('apn_select', manageEsimApnSelectSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageEsimApnSelect(deviceId, params), 'write', { fieldOrder: 3, describe: { order: 7, text: 'apn_select: Select an access point. ' }, deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId }),
    sdkOp('apn_set', manageEsimApnSetSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageEsimApnSet(deviceId, params), 'write', { fieldOrder: 4, describe: { order: 8, text: 'apn_set: Set access point settings.' }, deviceId: MANAGE_ESIM_SHARED_FIELDS.deviceId }),
] as const;
