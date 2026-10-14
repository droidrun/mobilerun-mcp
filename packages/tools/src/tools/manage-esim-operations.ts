import { type Operation, selectInput } from './operation-table.js';
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

export const MANAGE_ESIM_INPUT_FIELDS = {
    ...manageEsimSetRoamingSchema.partial().shape,
    ...manageEsimStatusSchema.partial().shape,
    ...manageEsimApnListSchema.partial().shape,
    ...manageEsimApnSelectSchema.partial().shape,
    ...manageEsimApnSetSchema.partial().shape,
    deviceId: z.string(),
    enable: z.boolean().optional(),
    smDpAddr: z.string().optional(),
    confirmationCode: z.string().optional(),
    matchingId: z.string().optional(),
    subId: z.number().int().optional(),
};

type ManageEsimInput = z.infer<z.ZodObject<typeof MANAGE_ESIM_INPUT_FIELDS>> & {
    operation: string;
};

export const MANAGE_ESIM_TABLE = [
    {
        op: 'list',
        input: selectInput(MANAGE_ESIM_INPUT_FIELDS, []),
        fieldOrder: 5,
        access: 'read',
        describe: { order: 0, text: 'eSIM subscription management. Operations: list, ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.listEsims(deviceId));
        },
    },
    {
        op: 'activate',
        input: selectInput(MANAGE_ESIM_INPUT_FIELDS, ['enable', 'smDpAddr', 'confirmationCode', 'matchingId']),
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
    },
    {
        op: 'enable',
        input: selectInput(MANAGE_ESIM_INPUT_FIELDS, ['subId']),
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
    },
    {
        op: 'remove',
        input: selectInput(MANAGE_ESIM_INPUT_FIELDS, ['subId']),
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
    },
    {
        op: 'set_roaming',
        input: selectInput(MANAGE_ESIM_INPUT_FIELDS, Object.keys(manageEsimSetRoamingSchema.shape)),
        fieldOrder: 0,
        access: 'write',
        describe: { order: 4, text: 'set_roaming: Enable or disable eSIM roaming. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageEsimSetRoaming(
                    input.deviceId,
                    manageEsimSetRoamingSchema.strip().parse(input),
                ),
            );
        },
    },
    {
        op: 'status',
        input: selectInput(MANAGE_ESIM_INPUT_FIELDS, Object.keys(manageEsimStatusSchema.shape)),
        fieldOrder: 1,
        access: 'read',
        describe: { order: 5, text: 'status: Read eSIM connectivity status. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageEsimStatus(
                    input.deviceId,
                    manageEsimStatusSchema.strip().parse(input),
                ),
            );
        },
    },
    {
        op: 'apn_list',
        input: selectInput(MANAGE_ESIM_INPUT_FIELDS, Object.keys(manageEsimApnListSchema.shape)),
        fieldOrder: 2,
        access: 'read',
        describe: { order: 6, text: 'apn_list: List available access point settings. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageEsimApnList(
                    input.deviceId,
                    manageEsimApnListSchema.strip().parse(input),
                ),
            );
        },
    },
    {
        op: 'apn_select',
        input: selectInput(MANAGE_ESIM_INPUT_FIELDS, Object.keys(manageEsimApnSelectSchema.shape)),
        fieldOrder: 3,
        access: 'write',
        describe: { order: 7, text: 'apn_select: Select an access point. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageEsimApnSelect(
                    input.deviceId,
                    manageEsimApnSelectSchema.strip().parse(input),
                ),
            );
        },
    },
    {
        op: 'apn_set',
        input: selectInput(MANAGE_ESIM_INPUT_FIELDS, Object.keys(manageEsimApnSetSchema.shape)),
        fieldOrder: 4,
        access: 'write',
        describe: { order: 8, text: 'apn_set: Set access point settings.' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageEsimApnSet(
                    input.deviceId,
                    manageEsimApnSetSchema.strip().parse(input),
                ),
            );
        },
    },
] as const satisfies readonly Operation<ManageEsimInput, CallToolResult>[];
