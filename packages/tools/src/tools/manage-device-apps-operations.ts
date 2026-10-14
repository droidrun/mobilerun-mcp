import { type Operation, selectInput } from './operation-table.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { requireValue } from './op-helpers.js';
import {
    manageDeviceAppsGrantPermissionSchema,
    manageDeviceAppsRevokePermissionSchema,
    manageDeviceAppsListInstallsSchema,
} from '../backend/device-control.js';

import { z } from 'zod';

import { asTextResult, ifDefined } from '../text-result.js';

export const MANAGE_APPS_INPUT_FIELDS = {
    ...manageDeviceAppsGrantPermissionSchema.partial().shape,
    ...manageDeviceAppsRevokePermissionSchema.partial().shape,
    ...manageDeviceAppsListInstallsSchema.partial().shape,
    deviceId: z.string(),
    packageName: z.string().optional(),
    bundleId: z.string().optional().describe('iOS bundle identifier (install only).'),
    activity: z.string().optional().describe('start only: specific activity to launch.'),
    includeSystemPackages: z.boolean().optional(),
    includeProtectedPackages: z.boolean().optional(),
};

type ManageAppsInput = z.infer<z.ZodObject<typeof MANAGE_APPS_INPUT_FIELDS>> & {
    operation: string;
};

export const MANAGE_APPS_TABLE = [
    {
        op: 'install',
        input: selectInput(MANAGE_APPS_INPUT_FIELDS, ['packageName', 'bundleId']),
        fieldOrder: 3,
        readonly: false,
        billed: false,
        describe: {
            order: 0,
            text: 'Mutate apps on a device. Operations: install (packageName and/or bundleId — at least one), ',
        },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const bundleId = input.bundleId as string | undefined;
            if (!packageName && !bundleId) throw new Error('operation=install requires packageName and/or bundleId');
            await backend.installApp(deviceId, { packageName, bundleId });
            return asTextResult({ status: 'install_requested', deviceId, packageName, bundleId });
        },
    },
    {
        op: 'delete',
        input: selectInput(MANAGE_APPS_INPUT_FIELDS, ['packageName']),
        fieldOrder: 4,
        readonly: false,
        billed: false,
        describe: { order: 1, text: 'delete (packageName), ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const pkg = requireValue(packageName, 'packageName', operation);
            await backend.deleteApp(deviceId, pkg);
            return asTextResult({ status: 'ok', operation, deviceId, packageName: pkg });
        },
    },
    {
        op: 'start',
        input: selectInput(MANAGE_APPS_INPUT_FIELDS, ['packageName', 'activity']),
        fieldOrder: 5,
        readonly: false,
        billed: false,
        describe: { order: 2, text: 'start (packageName, activity?), ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const pkg = requireValue(packageName, 'packageName', operation);
            await backend.startApp(deviceId, pkg, { activity: input.activity as string | undefined });
            return asTextResult({ status: 'ok', operation, deviceId, packageName: pkg });
        },
    },
    {
        op: 'stop',
        input: selectInput(MANAGE_APPS_INPUT_FIELDS, ['packageName']),
        fieldOrder: 6,
        readonly: false,
        billed: false,
        describe: { order: 3, text: 'stop (packageName), ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const pkg = requireValue(packageName, 'packageName', operation);
            await backend.stopApp(deviceId, pkg);
            return asTextResult({ status: 'ok', operation, deviceId, packageName: pkg });
        },
    },
    {
        op: 'list_packages',
        input: selectInput(MANAGE_APPS_INPUT_FIELDS, ['includeSystemPackages', 'includeProtectedPackages']),
        fieldOrder: 7,
        readonly: true,
        billed: false,
        describe: {
            order: 4,
            text: 'list_packages (raw installed package names, includeSystemPackages?, includeProtectedPackages?). Read app metadata (label, versions) via list_apps_on_device instead. Additional operations: ',
        },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(
                await backend.listPackages(deviceId, {
                    ...ifDefined('includeSystemPackages', input.includeSystemPackages as boolean | undefined),
                    ...ifDefined('includeProtectedPackages', input.includeProtectedPackages as boolean | undefined),
                }),
            );
        },
    },
    {
        op: 'grant_permission',
        input: selectInput(MANAGE_APPS_INPUT_FIELDS, Object.keys(manageDeviceAppsGrantPermissionSchema.shape)),
        fieldOrder: 0,
        readonly: false,
        billed: false,
        describe: { order: 5, text: 'grant_permission: Grant an app notification permission. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceAppsGrantPermission(
                    input.deviceId,
                    manageDeviceAppsGrantPermissionSchema.strip().parse(input),
                ),
            );
        },
    },
    {
        op: 'revoke_permission',
        input: selectInput(MANAGE_APPS_INPUT_FIELDS, Object.keys(manageDeviceAppsRevokePermissionSchema.shape)),
        fieldOrder: 1,
        readonly: false,
        billed: false,
        describe: { order: 6, text: 'revoke_permission: Revoke an app notification permission. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceAppsRevokePermission(
                    input.deviceId,
                    manageDeviceAppsRevokePermissionSchema.strip().parse(input),
                ),
            );
        },
    },
    {
        op: 'list_installs',
        input: selectInput(MANAGE_APPS_INPUT_FIELDS, Object.keys(manageDeviceAppsListInstallsSchema.shape)),
        fieldOrder: 2,
        readonly: true,
        billed: false,
        describe: { order: 7, text: 'list_installs: Read app installation jobs.' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.manageDeviceAppsListInstalls(
                    input.deviceId,
                    manageDeviceAppsListInstallsSchema.strip().parse(input),
                ),
            );
        },
    },
] as const satisfies readonly Operation<ManageAppsInput, CallToolResult>[];
