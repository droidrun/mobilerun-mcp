import { operation, sdkOp } from './operation-table.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { requireValue } from './op-helpers.js';
import {
    manageDeviceAppsGrantPermissionSchema,
    manageDeviceAppsRevokePermissionSchema,
    manageDeviceAppsListInstallsSchema,
} from '../backend/device-control.js';

import { z } from 'zod';

import { asTextResult, ifDefined } from '../text-result.js';

export const MANAGE_APPS_SHARED_FIELDS = {
    deviceId: z.string(),
    packageName: z.string().optional(),
};



export const MANAGE_APPS_TABLE = [
    operation({
        op: 'install',
        input: { packageName: MANAGE_APPS_SHARED_FIELDS.packageName, bundleId: z.string().optional().describe('iOS bundle identifier (install only).'), deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId },
        fieldOrder: 3,
        access: 'write',
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
    }),
    operation({
        op: 'delete',
        input: { packageName: MANAGE_APPS_SHARED_FIELDS.packageName, deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId },
        fieldOrder: 4,
        access: 'write',
        describe: { order: 1, text: 'delete (packageName), ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const pkg = requireValue(packageName, 'packageName', operation);
            await backend.deleteApp(deviceId, pkg);
            return asTextResult({ status: 'ok', operation, deviceId, packageName: pkg });
        },
    }),
    operation({
        op: 'start',
        input: { packageName: MANAGE_APPS_SHARED_FIELDS.packageName, activity: z.string().optional().describe('start only: specific activity to launch.'), deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId },
        fieldOrder: 5,
        access: 'write',
        describe: { order: 2, text: 'start (packageName, activity?), ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const pkg = requireValue(packageName, 'packageName', operation);
            await backend.startApp(deviceId, pkg, { activity: input.activity as string | undefined });
            return asTextResult({ status: 'ok', operation, deviceId, packageName: pkg });
        },
    }),
    operation({
        op: 'stop',
        input: { packageName: MANAGE_APPS_SHARED_FIELDS.packageName, deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId },
        fieldOrder: 6,
        access: 'write',
        describe: { order: 3, text: 'stop (packageName), ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const pkg = requireValue(packageName, 'packageName', operation);
            await backend.stopApp(deviceId, pkg);
            return asTextResult({ status: 'ok', operation, deviceId, packageName: pkg });
        },
    }),
    operation({
        op: 'list_packages',
        input: { includeSystemPackages: z.boolean().optional(), includeProtectedPackages: z.boolean().optional(), deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId },
        fieldOrder: 7,
        access: 'read',
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
    }),
    sdkOp('grant_permission', manageDeviceAppsGrantPermissionSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceAppsGrantPermission(deviceId, params), 'write', { fieldOrder: 0, describe: { order: 5, text: 'grant_permission: Grant an app notification permission. ' }, deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId }),
    sdkOp('revoke_permission', manageDeviceAppsRevokePermissionSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceAppsRevokePermission(deviceId, params), 'write', { fieldOrder: 1, describe: { order: 6, text: 'revoke_permission: Revoke an app notification permission. ' }, deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId }),
    sdkOp('list_installs', manageDeviceAppsListInstallsSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceAppsListInstalls(deviceId, params), 'read', { fieldOrder: 2, describe: { order: 7, text: 'list_installs: Read app installation jobs.' }, deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId }),
] as const;
