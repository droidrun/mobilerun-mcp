import { purchaseResult } from './response.js';
/**
 * DevicesBackend over @mobilerun/sdk's `client.devices.*`. Every mapping
 * here was verified against the SDK's shipped .d.ts (not guessed) — see the
 * deviation/gap comments below for the spots where the public SDK's typed
 * surface has rough edges.
 */
import { captureDeviceScreenshot } from './response.js';
import { toApiDeviceType } from './device-types.js';
import { type default as Mobilerun } from '@mobilerun/sdk';
import {
    type CreateDeviceOpts,
    type DevicesBackend,
    type ListAppsOnDeviceOpts,
    type ListDevicesOpts,
} from '@mobilerun/mcp-tools';

export function createDevicesBackend(client: Mobilerun): DevicesBackend {
    return {
        async listDevices(opts: ListDevicesOpts) {
            return client.devices.list({
                state: opts.state ? [...opts.state] : undefined,
                type: toApiDeviceType(opts.type),
                name: opts.name,
                country: opts.country,
                page: opts.page,
                pageSize: opts.pageSize,
            });
        },
        async getDevice(deviceId: string) {
            return client.devices.retrieve(deviceId);
        },
        async getDeviceScreenshot(deviceId: string) {
            const { contentBase64 } = await captureDeviceScreenshot(client, deviceId, { save: false });
            return { deviceId, screenshot: contentBase64 };
        },
        async getDeviceUiState(deviceId: string) {
            // `filter: true` lets the device drop tiny/offscreen nodes before
            // they reach us.
            return client.devices.state.ui(deviceId, { filter: true });
        },
        async listAppsOnDevice(deviceId: string, opts: ListAppsOnDeviceOpts) {
            return client.devices.apps.list(deviceId, {
                includeSystemApps: opts.includeSystemApps,
                includeProtectedApps: opts.includeProtectedApps,
            });
        },
        async createDevice(opts: CreateDeviceOpts) {
            return purchaseResult(client.devices.create({
                deviceType: toApiDeviceType(opts.deviceType),
                name: opts.name,
                // SDK's query param is `query_country`, not `country`.
                query_country: opts.country?.toUpperCase(),
            }));
        },
        async terminateDevice(deviceId: string) {
            await client.devices.terminate(deviceId, {});
            return { status: 'termination_requested' as const, deviceId };
        },
    };
}
