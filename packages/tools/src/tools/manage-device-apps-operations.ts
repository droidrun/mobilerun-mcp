import {
    manageDeviceAppsGrantPermissionSchema,
    manageDeviceAppsListInstallsSchema,
    manageDeviceAppsRevokePermissionSchema,
} from '../backend/device-control.js';
import { operation, requireValue, sdkOp } from './operation-table.js';

import { z } from 'zod';

import { asTextResult, ifDefined } from '../text-result.js';

export const MANAGE_APPS_SHARED_FIELDS = {
    deviceId: z.string(),
    packageName: z.string().optional(),
};

export const MANAGE_APPS_INTRO = 'Manage apps on a device.';
export const MANAGE_APPS_TABLE = [
    operation({
        op: 'install',
        input: {
            packageName: MANAGE_APPS_SHARED_FIELDS.packageName,
            bundleId: z.string().optional().describe('iOS bundle identifier (install only).'),
            deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId,
        },
        access: 'write',
        doc: 'Install an app; at least one of packageName or bundleId is required.',
        run: async (ctx, input) => {
            const { deviceId } = input;

            const packageName = input.packageName;
            const bundleId = input.bundleId;
            if (!packageName && !bundleId) throw new Error('operation=install requires packageName and/or bundleId');
            await ctx.backend.deviceControl.installApp(deviceId, { packageName, bundleId });
            return asTextResult({ status: 'install_requested', deviceId, packageName, bundleId });
        },
    }),
    operation({
        op: 'delete',
        input: { packageName: MANAGE_APPS_SHARED_FIELDS.packageName, deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: 'Delete packageName.',
        run: async (ctx, input) => {
            const { deviceId } = input;

            const packageName = input.packageName;
            const pkg = requireValue(packageName, 'packageName', input.operation);
            await ctx.backend.deviceControl.deleteApp(deviceId, pkg);
            return asTextResult({ status: 'ok', operation: input.operation, deviceId, packageName: pkg });
        },
    }),
    operation({
        op: 'start',
        input: {
            packageName: MANAGE_APPS_SHARED_FIELDS.packageName,
            activity: z.string().optional().describe('start only: specific activity to launch.'),
            deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId,
        },
        access: 'write',
        doc: 'Start packageName, optionally at activity.',
        run: async (ctx, input) => {
            const { deviceId } = input;

            const packageName = input.packageName;
            const pkg = requireValue(packageName, 'packageName', input.operation);
            await ctx.backend.deviceControl.startApp(deviceId, pkg, { activity: input.activity });
            return asTextResult({ status: 'ok', operation: input.operation, deviceId, packageName: pkg });
        },
    }),
    operation({
        op: 'stop',
        input: { packageName: MANAGE_APPS_SHARED_FIELDS.packageName, deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: 'Stop packageName.',
        run: async (ctx, input) => {
            const { deviceId } = input;

            const packageName = input.packageName;
            const pkg = requireValue(packageName, 'packageName', input.operation);
            await ctx.backend.deviceControl.stopApp(deviceId, pkg);
            return asTextResult({ status: 'ok', operation: input.operation, deviceId, packageName: pkg });
        },
    }),
    operation({
        op: 'list_packages',
        input: {
            includeSystemPackages: z.boolean().optional(),
            includeProtectedPackages: z.boolean().optional(),
            deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId,
        },
        access: 'read',
        doc: 'List raw installed package names, optionally including system or protected packages. Read app metadata (label, versions) via list_apps_on_device instead.',
        run: async (ctx, input) =>
            asTextResult(
                await ctx.backend.deviceControl.listPackages(input.deviceId, {
                    ...ifDefined('includeSystemPackages', input.includeSystemPackages),
                    ...ifDefined('includeProtectedPackages', input.includeProtectedPackages),
                }),
            ),
    }),
    sdkOp(
        'grant_permission',
        manageDeviceAppsGrantPermissionSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceAppsGrantPermission(deviceId, params),
        'write',
        { doc: 'Grant an app notification permission.', deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'revoke_permission',
        manageDeviceAppsRevokePermissionSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceAppsRevokePermission(deviceId, params),
        'write',
        { doc: 'Revoke an app notification permission.', deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'list_installs',
        manageDeviceAppsListInstallsSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.manageDeviceAppsListInstalls(deviceId, params),
        'read',
        { doc: 'Read app installation jobs.', deviceId: MANAGE_APPS_SHARED_FIELDS.deviceId },
    ),
] as const;
