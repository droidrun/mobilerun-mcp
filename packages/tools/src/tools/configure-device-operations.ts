import {
    configureDeviceKioskDisableSchema,
    configureDeviceKioskEnableSchema,
    configureDeviceResetLocationSchema,
    configureDeviceUpdateProfileSchema,
} from '../backend/device-control.js';
import { operation, requireValue, sdkOp } from './operation-table.js';

import { z } from 'zod';

import { asTextResult } from '../text-result.js';

export const CONFIGURE_DEVICE_SHARED_FIELDS = {
    deviceId: z.string(),
};

export const CONFIGURE_DEVICE_INTRO = 'Read and write device settings.';
export const CONFIGURE_DEVICE_TABLE = [
    operation({
        op: 'get_language',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: 'Read the device language.',
        run: async (ctx, input) => asTextResult(await ctx.backend.deviceControl.getLanguage(input.deviceId)),
    }),
    operation({
        op: 'set_language',
        input: {
            locale: z.string().optional(),
            restart: z.boolean().optional(),
            deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId,
        },
        access: 'write',
        doc: 'Set locale (BCP-47, e.g. en-US); restart forces immediate application instead of waiting for the next reboot.',
        run: async (ctx, input) => {
            const { deviceId } = input;

            await ctx.backend.deviceControl.setLanguage(deviceId, {
                locale: requireValue(input.locale, 'locale', input.operation),
                restart: input.restart,
            });
            return asTextResult({ status: 'ok', operation: input.operation, deviceId });
        },
    }),
    operation({
        op: 'get_timezone',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: 'Read the device time zone.',
        run: async (ctx, input) => asTextResult(await ctx.backend.deviceControl.getTimezone(input.deviceId)),
    }),
    operation({
        op: 'set_timezone',
        input: { timezone: z.string().optional(), deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: 'Set an IANA time zone.',
        run: async (ctx, input) => {
            const { deviceId } = input;

            await ctx.backend.deviceControl.setTimezone(
                deviceId,
                requireValue(input.timezone, 'timezone', input.operation),
            );
            return asTextResult({ status: 'ok', operation: input.operation, deviceId });
        },
    }),
    operation({
        op: 'get_location',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: 'Read the device location.',
        run: async (ctx, input) => asTextResult(await ctx.backend.deviceControl.getLocation(input.deviceId)),
    }),
    operation({
        op: 'set_location',
        input: {
            latitude: z.number().optional(),
            longitude: z.number().optional(),
            deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId,
        },
        access: 'write',
        doc: 'Set latitude and longitude.',
        run: async (ctx, input) => {
            const { deviceId } = input;

            await ctx.backend.deviceControl.setLocation(deviceId, {
                latitude: requireValue(input.latitude, 'latitude', input.operation),
                longitude: requireValue(input.longitude, 'longitude', input.operation),
            });
            return asTextResult({ status: 'ok', operation: input.operation, deviceId });
        },
    }),
    operation({
        op: 'get_time',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: 'Read the device clock.',
        run: async (ctx, input) => asTextResult(await ctx.backend.deviceControl.getTime(input.deviceId)),
    }),
    operation({
        op: 'get_overlay',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: 'Read the on-device debug/annotation overlay state.',
        run: async (ctx, input) => asTextResult(await ctx.backend.deviceControl.getOverlay(input.deviceId)),
    }),
    operation({
        op: 'set_overlay',
        input: { visible: z.boolean().optional(), deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'write',
        doc: 'Set whether the on-device debug/annotation overlay is visible.',
        run: async (ctx, input) => {
            const { deviceId } = input;

            await ctx.backend.deviceControl.setOverlay(
                deviceId,
                requireValue(input.visible, 'visible', input.operation),
            );
            return asTextResult({ status: 'ok', operation: input.operation, deviceId });
        },
    }),
    operation({
        op: 'proxy_connect',
        input: {
            proxyName: z.string().optional(),
            smartIp: z.boolean().optional(),
            socks5Host: z.string().optional(),
            socks5Port: z.number().int().optional(),
            socks5User: z.string().optional(),
            socks5Password: z.string().optional(),
            deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId,
        },
        access: 'write',
        doc: 'Connect proxyName and/or smartIp, or socks5Host+socks5Port with optional socks5User/socks5Password. smartIp defaults to true and aligns location, time zone, locale and carrier settings with the proxy region; pass false to leave device settings unchanged.',
        run: async (ctx, input) => {
            const { deviceId } = input;

            const socks5Host = input.socks5Host;
            const socks5Port = input.socks5Port;
            await ctx.backend.deviceControl.connectProxy(deviceId, {
                name: input.proxyName,
                // Default smart-IP on: align device location, time zone, locale, and carrier with the proxy region unless the caller explicitly opts out.
                smartIp: input.smartIp ?? true,
                socks5:
                    socks5Host && socks5Port !== undefined
                        ? {
                              host: socks5Host,
                              port: socks5Port,
                              user: input.socks5User,
                              password: input.socks5Password,
                          }
                        : undefined,
            });
            return asTextResult({ status: 'ok', operation: input.operation, deviceId });
        },
    }),
    operation({
        op: 'proxy_disconnect',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'write',
        destructive: true,
        doc: 'Disconnect the proxy.',
        run: async (ctx, input) => {
            const { deviceId } = input;

            await ctx.backend.deviceControl.disconnectProxy(deviceId);
            return asTextResult({ status: 'ok', operation: input.operation, deviceId });
        },
    }),
    operation({
        op: 'get_proxy_status',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        access: 'read',
        doc: 'Read proxy status.',
        run: async (ctx, input) => asTextResult(await ctx.backend.deviceControl.getProxyStatus(input.deviceId)),
    }),
    sdkOp(
        'reset_location',
        configureDeviceResetLocationSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.configureDeviceResetLocation(deviceId, params),
        'write',
        { doc: 'Reset the device location.', deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'kiosk_enable',
        configureDeviceKioskEnableSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.configureDeviceKioskEnable(deviceId, params),
        'write',
        { doc: 'Enable kiosk mode for an app.', deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'kiosk_disable',
        configureDeviceKioskDisableSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.configureDeviceKioskDisable(deviceId, params),
        'write',
        { doc: 'Disable kiosk mode.', deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
    ),
    sdkOp(
        'update_profile',
        configureDeviceUpdateProfileSchema,
        (ctx, params, deviceId) => ctx.backend.deviceControl.configureDeviceUpdateProfile(deviceId, params),
        'write',
        { doc: 'Update device profile settings.', deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
    ),
] as const;
