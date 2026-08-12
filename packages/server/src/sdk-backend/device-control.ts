import Mobilerun, { toFile } from '@mobilerun/sdk';
import type {
    AppInstallOpts,
    AppStartOpts,
    DeviceActionParams,
    DeviceCapabilitiesDto,
    DeviceControlBackend,
    EsimActivateOpts,
    FileListOpts,
    FileUploadOpts,
    ListPackagesOpts,
    LocationDto,
    ProxyConnectOpts,
    SetLanguageOpts,
} from '@mobilerun/mcp-tools';

function headerOpts(displayId: number | undefined) {
    return displayId !== undefined ? { 'X-Device-Display-ID': displayId } : {};
}

/**
 * DeviceControlBackend over @mobilerun/sdk's `client.devices.{actions,apps,
 * esim,files,keyboard,language,location,packages,profile,proxy,state,
 * timezone}` — every mapping verified against the SDK's shipped .d.ts (not
 * guessed). See ../../tools/src/tools/device-control.ts's header for the
 * originally-sketched operations that turned out to have no SDK surface at all
 * (deeplink/execute-script, app permission grant/revoke, list_installs,
 * kiosk mode, location reset, esim APN/roaming/connectivity-status) and
 * were dropped rather than stubbed here.
 */
export function createDeviceControlBackend(client: Mobilerun): DeviceControlBackend {
    return {
        // manage_device
        async rebootDevice(deviceId) {
            await client.devices.reboot(deviceId);
        },
        async resetDevice(deviceId) {
            await client.devices.reset(deviceId);
        },
        async renameDevice(deviceId, name) {
            await client.devices.setName(deviceId, { name });
        },
        async waitDeviceReady(deviceId) {
            await client.devices.waitReady(deviceId);
        },
        async getDeviceCapabilities(deviceId) {
            // Cast: the SDK's DeviceFingerprintResponse types carrier/
            // identifiers as exhaustive fixed-shape interfaces
            // (DeviceCarrier/DeviceIdentifiers); this port's DTO widens
            // them to Record<string, unknown> (surfaced, not exhaustively
            // mirrored — see ../../tools/src/backend/device-control.ts).
            return (await client.devices.fingerprint(deviceId)) as unknown as DeviceCapabilitiesDto;
        },
        async countDevices() {
            return client.devices.count();
        },

        // device_action
        async tap(params: DeviceActionParams) {
            await client.devices.actions.tap(params.deviceId, {
                x: params.x!,
                y: params.y!,
                stealth: params.stealth,
                ...headerOpts(params.displayId),
            });
        },
        async swipe(params: DeviceActionParams) {
            await client.devices.actions.swipe(params.deviceId, {
                startX: params.startX!,
                startY: params.startY!,
                endX: params.endX!,
                endY: params.endY!,
                duration: params.duration!,
                stealth: params.stealth,
                ...headerOpts(params.displayId),
            });
        },
        async keyboardWrite(params: DeviceActionParams) {
            await client.devices.keyboard.write(params.deviceId, {
                text: params.text!,
                clear: params.clear,
                errorRate: params.errorRate,
                wpm: params.wpm,
                stealth: params.stealth,
                ...headerOpts(params.displayId),
            });
        },
        async keyboardKey(params: DeviceActionParams) {
            await client.devices.keyboard.key(params.deviceId, { key: params.key!, ...headerOpts(params.displayId) });
        },
        async keyboardClear(deviceId, displayId) {
            await client.devices.keyboard.clear(deviceId, headerOpts(displayId));
        },
        async globalAction(params: DeviceActionParams) {
            await client.devices.actions.global(params.deviceId, { action: params.action!, ...headerOpts(params.displayId) });
        },

        // manage_device_apps
        async installApp(deviceId, opts: AppInstallOpts) {
            // SDK's AppInstallParams is a discriminated union requiring one of
            // packageName/bundleId as the "primary" key — either works with
            // the other optional, so this cast is safe for our "at least one"
            // validation already done at the tool layer.
            await client.devices.apps.install(deviceId, { packageName: opts.packageName, bundleId: opts.bundleId } as Parameters<typeof client.devices.apps.install>[1]);
        },
        async deleteApp(deviceId, packageName) {
            await client.devices.apps.delete(packageName, { deviceId });
        },
        async startApp(deviceId, packageName, opts: AppStartOpts) {
            await client.devices.apps.start(packageName, { deviceId, activity: opts.activity });
        },
        async stopApp(deviceId, packageName) {
            await client.devices.apps.stop(packageName, { deviceId });
        },
        async listPackages(deviceId, opts: ListPackagesOpts) {
            return client.devices.packages.list(deviceId, {
                includeSystemPackages: opts.includeSystemPackages,
                includeProtectedPackages: opts.includeProtectedPackages,
            });
        },

        // manage_device_files
        async listFiles(deviceId, opts: FileListOpts) {
            return client.devices.files.list(deviceId, { path: opts.path });
        },
        async uploadFile(deviceId, opts: FileUploadOpts) {
            const buffer = Buffer.from(opts.contentBase64, 'base64');
            const file = await toFile(buffer, opts.fileName, opts.contentType ? { type: opts.contentType } : undefined);
            await client.devices.files.upload(deviceId, { path: opts.path, file });
        },
        async downloadFile(deviceId, path) {
            const content = await client.devices.files.download(deviceId, { path });
            return { content };
        },
        async deleteFile(deviceId, path) {
            await client.devices.files.delete(deviceId, { path });
        },

        // configure_device
        async getLanguage(deviceId) {
            return client.devices.language.get(deviceId);
        },
        async setLanguage(deviceId, opts: SetLanguageOpts) {
            await client.devices.language.set(deviceId, { locale: opts.locale, restart: opts.restart });
        },
        async getTimezone(deviceId) {
            return client.devices.timezone.get(deviceId);
        },
        async setTimezone(deviceId, timezone) {
            await client.devices.timezone.set(deviceId, { timezone });
        },
        async getLocation(deviceId) {
            const location = await client.devices.location.get(deviceId);
            return { latitude: location.latitude, longitude: location.longitude };
        },
        async setLocation(deviceId, opts: LocationDto) {
            await client.devices.location.set(deviceId, { latitude: opts.latitude, longitude: opts.longitude });
        },
        async getTime(deviceId) {
            const time = await client.devices.state.time(deviceId);
            return { time };
        },
        async getOverlay(deviceId) {
            return client.devices.actions.overlayVisible(deviceId);
        },
        async setOverlay(deviceId, visible) {
            await client.devices.actions.setOverlayVisible(deviceId, { visible });
        },
        async connectProxy(deviceId, opts: ProxyConnectOpts) {
            await client.devices.proxy.connect(deviceId, { name: opts.name, smartIp: opts.smartIp, socks5: opts.socks5 });
        },
        async disconnectProxy(deviceId) {
            await client.devices.proxy.disconnect(deviceId);
        },
        async getProxyStatus(deviceId) {
            return client.devices.proxy.status(deviceId);
        },

        // manage_esim
        async listEsims(deviceId) {
            return client.devices.esim.list(deviceId);
        },
        async activateEsim(deviceId, opts: EsimActivateOpts) {
            return client.devices.esim.activate(deviceId, {
                enable: opts.enable,
                smDpAddr: opts.smDpAddr,
                confirmationCode: opts.confirmationCode,
                matchingId: opts.matchingId,
            });
        },
        async enableEsim(deviceId, subId) {
            await client.devices.esim.enable(deviceId, { subId });
        },
        async removeEsim(deviceId, subId) {
            await client.devices.esim.remove(deviceId, { subId });
        },
    };
}
