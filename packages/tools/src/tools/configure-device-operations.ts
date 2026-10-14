import { operation, sdkOp } from './operation-table.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { requireValue } from './op-helpers.js';
import {
    configureDeviceResetLocationSchema,
    configureDeviceKioskEnableSchema,
    configureDeviceKioskDisableSchema,
    configureDeviceUpdateProfileSchema,
} from '../backend/device-control.js';

import { z } from 'zod';

import { asTextResult } from '../text-result.js';

export const CONFIGURE_DEVICE_SHARED_FIELDS = {
    deviceId: z.string(),
};



export const CONFIGURE_DEVICE_INTRO = "Read and write device settings.";
export const CONFIGURE_DEVICE_TABLE = [
    operation({
        op: 'get_language',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 4,
        access: 'read',
        doc: "Read the device language.",
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getLanguage(deviceId));
        },
    }),
    operation({
        op: 'set_language',
        input: { locale: z.string().optional(), restart: z.boolean().optional(), deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 5,
        access: 'write',
        doc: "Set locale (BCP-47, e.g. en-US); restart forces immediate application instead of waiting for the next reboot.",
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.setLanguage(deviceId, {
                locale: requireValue(input.locale as string | undefined, 'locale', operation),
                restart: input.restart as boolean | undefined,
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    }),
    operation({
        op: 'get_timezone',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 6,
        access: 'read',
        doc: "Read the device time zone.",
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getTimezone(deviceId));
        },
    }),
    operation({
        op: 'set_timezone',
        input: { timezone: z.string().optional(), deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 7,
        access: 'write',
        doc: "Set an IANA time zone.",
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.setTimezone(
                deviceId,
                requireValue(input.timezone as string | undefined, 'timezone', operation),
            );
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    }),
    operation({
        op: 'get_location',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 8,
        access: 'read',
        doc: "Read the device location.",
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getLocation(deviceId));
        },
    }),
    operation({
        op: 'set_location',
        input: { latitude: z.number().optional(), longitude: z.number().optional(), deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 9,
        access: 'write',
        doc: "Set latitude and longitude.",
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.setLocation(deviceId, {
                latitude: requireValue(input.latitude as number | undefined, 'latitude', operation),
                longitude: requireValue(input.longitude as number | undefined, 'longitude', operation),
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    }),
    operation({
        op: 'get_time',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 10,
        access: 'read',
        doc: "Read the device clock.",
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getTime(deviceId));
        },
    }),
    operation({
        op: 'get_overlay',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 11,
        access: 'read',
        doc: "Read the on-device debug/annotation overlay state.",
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getOverlay(deviceId));
        },
    }),
    operation({
        op: 'set_overlay',
        input: { visible: z.boolean().optional(), deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 12,
        access: 'write',
        doc: "Set whether the on-device debug/annotation overlay is visible.",
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.setOverlay(
                deviceId,
                requireValue(input.visible as boolean | undefined, 'visible', operation),
            );
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    }),
    operation({
        op: 'proxy_connect',
        input: { proxyName: z.string().optional(), smartIp: z.boolean().optional(), socks5Host: z.string().optional(), socks5Port: z.number().int().optional(), socks5User: z.string().optional(), socks5Password: z.string().optional(), deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 13,
        access: 'write',
        doc: "Connect proxyName and/or smartIp, or socks5Host+socks5Port with optional socks5User/socks5Password. smartIp defaults to true and aligns location, time zone, locale and carrier settings with the proxy region; pass false to leave device settings unchanged.",
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            const socks5Host = input.socks5Host as string | undefined;
            const socks5Port = input.socks5Port as number | undefined;
            await backend.connectProxy(deviceId, {
                name: input.proxyName as string | undefined,
                // Default smart-IP on: align device location, time zone, locale, and carrier with the proxy region unless the caller explicitly opts out.
                smartIp: (input.smartIp as boolean | undefined) ?? true,
                socks5:
                    socks5Host && socks5Port !== undefined
                        ? {
                              host: socks5Host,
                              port: socks5Port,
                              user: input.socks5User as string | undefined,
                              password: input.socks5Password as string | undefined,
                          }
                        : undefined,
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    }),
    operation({
        op: 'proxy_disconnect',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 14,
        access: 'write',
        doc: "Disconnect the proxy.",
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.disconnectProxy(deviceId);
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    }),
    operation({
        op: 'get_proxy_status',
        input: { deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId },
        fieldOrder: 15,
        access: 'read',
        doc: "Read proxy status.",
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getProxyStatus(deviceId));
        },
    }),
    sdkOp('reset_location', configureDeviceResetLocationSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.configureDeviceResetLocation(deviceId, params), 'write', { fieldOrder: 0, doc: "Reset the device location.", deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('kiosk_enable', configureDeviceKioskEnableSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.configureDeviceKioskEnable(deviceId, params), 'write', { fieldOrder: 1, doc: "Enable kiosk mode for an app.", deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('kiosk_disable', configureDeviceKioskDisableSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.configureDeviceKioskDisable(deviceId, params), 'write', { fieldOrder: 2, doc: "Disable kiosk mode.", deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId }),
    sdkOp('update_profile', configureDeviceUpdateProfileSchema, (ctx, params, deviceId) => ctx.backend.deviceControl.configureDeviceUpdateProfile(deviceId, params), 'write', { fieldOrder: 3, doc: "Update device profile settings.", deviceId: CONFIGURE_DEVICE_SHARED_FIELDS.deviceId }),
] as const;
