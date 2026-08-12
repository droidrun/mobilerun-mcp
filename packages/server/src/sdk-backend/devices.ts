import type Mobilerun from '@mobilerun/sdk';
import type { CreateDeviceOpts, DevicesBackend, ListAppsOnDeviceOpts, ListDevicesOpts } from '@mobilerun/mcp-tools';

/**
 * DevicesBackend over @mobilerun/sdk's `client.devices.*`. Every mapping
 * here was verified against the SDK's shipped .d.ts (not guessed) — see the
 * deviation/gap comments below for the spots where the public SDK's typed
 * surface has rough edges.
 */
export function createDevicesBackend(client: Mobilerun): DevicesBackend {
    return {
        async listDevices(opts: ListDevicesOpts) {
            return client.devices.list({
                state: opts.state ? [...opts.state] : undefined,
                type: opts.type,
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
            // SDK types this as APIPromise<string> (StateScreenshotResponse = string).
            // Shape (base64 payload vs signed URL) is not documented in the
            // .d.ts — passed through as-is; see this repo's README for the
            // caveat surfaced to callers.
            const screenshot = await client.devices.state.screenshot(deviceId);
            return { deviceId, screenshot };
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
            return client.devices.create({
                deviceType: opts.deviceType,
                name: opts.name,
                // SDK's query param is `query_country`, not `country`.
                query_country: opts.country?.toUpperCase(),
            });
        },
        async terminateDevice(deviceId: string) {
            await client.devices.terminate(deviceId, {});
            return { status: 'termination_requested' as const, deviceId };
        },
    };
}
