import { type Operation, selectInput } from './operation-table.js';
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

export const CONFIGURE_DEVICE_INPUT_FIELDS = {
    ...configureDeviceResetLocationSchema.partial().shape,
    ...configureDeviceKioskEnableSchema.partial().shape,
    ...configureDeviceKioskDisableSchema.partial().shape,
    ...configureDeviceUpdateProfileSchema.partial().shape,
    deviceId: z.string(),
    locale: z.string().optional(),
    restart: z.boolean().optional(),
    timezone: z.string().optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
    visible: z.boolean().optional(),
    proxyName: z.string().optional(),
    smartIp: z.boolean().optional(),
    socks5Host: z.string().optional(),
    socks5Port: z.number().int().optional(),
    socks5User: z.string().optional(),
    socks5Password: z.string().optional(),
};

type ConfigureDeviceInput = z.infer<z.ZodObject<typeof CONFIGURE_DEVICE_INPUT_FIELDS>> & {
    operation: string;
};

export const CONFIGURE_DEVICE_TABLE = [
    {
        op: 'get_language',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []),
        fieldOrder: 4,
        readonly: true,
        billed: false,
        describe: { order: 0, text: 'Read/write device settings. Operations: get_language/' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getLanguage(deviceId));
        },
    },
    {
        op: 'set_language',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, ['locale', 'restart']),
        fieldOrder: 5,
        readonly: false,
        billed: false,
        describe: {
            order: 1,
            text: 'set_language (locale: BCP-47 e.g. en-US; restart? forces the change to apply immediately instead of on next reboot), ',
        },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.setLanguage(deviceId, {
                locale: requireValue(input.locale as string | undefined, 'locale', operation),
                restart: input.restart as boolean | undefined,
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    },
    {
        op: 'get_timezone',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []),
        fieldOrder: 6,
        readonly: true,
        billed: false,
        describe: { order: 2, text: 'get_timezone/' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getTimezone(deviceId));
        },
    },
    {
        op: 'set_timezone',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, ['timezone']),
        fieldOrder: 7,
        readonly: false,
        billed: false,
        describe: { order: 3, text: 'set_timezone (IANA tz), ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.setTimezone(
                deviceId,
                requireValue(input.timezone as string | undefined, 'timezone', operation),
            );
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    },
    {
        op: 'get_location',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []),
        fieldOrder: 8,
        readonly: true,
        billed: false,
        describe: { order: 4, text: 'get_location/' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getLocation(deviceId));
        },
    },
    {
        op: 'set_location',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, ['latitude', 'longitude']),
        fieldOrder: 9,
        readonly: false,
        billed: false,
        describe: { order: 5, text: 'set_location (latitude, longitude), ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.setLocation(deviceId, {
                latitude: requireValue(input.latitude as number | undefined, 'latitude', operation),
                longitude: requireValue(input.longitude as number | undefined, 'longitude', operation),
            });
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    },
    {
        op: 'get_time',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []),
        fieldOrder: 10,
        readonly: true,
        billed: false,
        describe: { order: 6, text: 'get_time (read-only device clock), ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getTime(deviceId));
        },
    },
    {
        op: 'get_overlay',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []),
        fieldOrder: 11,
        readonly: true,
        billed: false,
        describe: { order: 7, text: 'get_overlay/' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getOverlay(deviceId));
        },
    },
    {
        op: 'set_overlay',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, ['visible']),
        fieldOrder: 12,
        readonly: false,
        billed: false,
        describe: { order: 8, text: 'set_overlay (visible: the on-device debug/annotation overlay), ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.setOverlay(
                deviceId,
                requireValue(input.visible as boolean | undefined, 'visible', operation),
            );
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    },
    {
        op: 'proxy_connect',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, [
            'proxyName',
            'smartIp',
            'socks5Host',
            'socks5Port',
            'socks5User',
            'socks5Password',
        ]),
        fieldOrder: 13,
        readonly: false,
        billed: false,
        describe: {
            order: 9,
            text: 'proxy_connect (proxyName? and/or smartIp?, or socks5Host+socks5Port+socks5User?+socks5Password? for a SOCKS5 proxy; smartIp defaults to true — aligns the device location, time zone, locale, and carrier settings with the proxy region; pass false to connect without changing device settings), ',
        },
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
    },
    {
        op: 'proxy_disconnect',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []),
        fieldOrder: 14,
        readonly: false,
        billed: false,
        describe: { order: 10, text: 'proxy_disconnect, ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            await backend.disconnectProxy(deviceId);
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    },
    {
        op: 'get_proxy_status',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, []),
        fieldOrder: 15,
        readonly: true,
        billed: false,
        describe: { order: 11, text: 'get_proxy_status. Additional operations: ' },
        run: async (ctx, input) => {
            const { operation, deviceId } = input;
            const backend = ctx.backend.deviceControl;
            return asTextResult(await backend.getProxyStatus(deviceId));
        },
    },
    {
        op: 'reset_location',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, Object.keys(configureDeviceResetLocationSchema.shape)),
        fieldOrder: 0,
        readonly: false,
        billed: false,
        describe: { order: 12, text: 'reset_location: Reset the device location. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.configureDeviceResetLocation(
                    input.deviceId,
                    configureDeviceResetLocationSchema.strip().parse(input),
                ),
            );
        },
    },
    {
        op: 'kiosk_enable',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, Object.keys(configureDeviceKioskEnableSchema.shape)),
        fieldOrder: 1,
        readonly: false,
        billed: false,
        describe: { order: 13, text: 'kiosk_enable: Enable kiosk mode for an app. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.configureDeviceKioskEnable(
                    input.deviceId,
                    configureDeviceKioskEnableSchema.strip().parse(input),
                ),
            );
        },
    },
    {
        op: 'kiosk_disable',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, Object.keys(configureDeviceKioskDisableSchema.shape)),
        fieldOrder: 2,
        readonly: false,
        billed: false,
        describe: { order: 14, text: 'kiosk_disable: Disable kiosk mode. ' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.configureDeviceKioskDisable(
                    input.deviceId,
                    configureDeviceKioskDisableSchema.strip().parse(input),
                ),
            );
        },
    },
    {
        op: 'update_profile',
        input: selectInput(CONFIGURE_DEVICE_INPUT_FIELDS, Object.keys(configureDeviceUpdateProfileSchema.shape)),
        fieldOrder: 3,
        readonly: false,
        billed: false,
        describe: { order: 15, text: 'update_profile: Update device profile settings.' },
        run: async (ctx, input) => {
            return asTextResult(
                await ctx.backend.deviceControl.configureDeviceUpdateProfile(
                    input.deviceId,
                    configureDeviceUpdateProfileSchema.strip().parse(input),
                ),
            );
        },
    },
] as const satisfies readonly Operation<ConfigureDeviceInput, CallToolResult>[];
