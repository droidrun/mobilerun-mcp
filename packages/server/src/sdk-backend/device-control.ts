/** Device-control mappings over the typed public client. */
import { captureDeviceScreenshot, headerOpts, signedDownload, signedDownloadOpts } from './response.js';
import { default as Mobilerun, toFile } from '@mobilerun/sdk';
import {
    type AppInstallOpts,
    type AppStartOpts,
    type DeviceActionParams,
    type DeviceCapabilitiesDto,
    type DeviceControlBackend,
    type EsimActivateOpts,
    type FileListOpts,
    type FileUploadOpts,
    type ListPackagesOpts,
    type LocationDto,
    type ProxyConnectOpts,
    type SetLanguageOpts,
} from '@mobilerun/mcp-tools';

export function createDeviceControlBackend(client: Mobilerun): DeviceControlBackend {
    return {
        async manageDeviceRecordingsTrajectory(deviceId, params) {
            return signedDownload(
                client.devices.recordings.trajectory(params.recordingId, { deviceId }, signedDownloadOpts),
            );
        },
        async manageDeviceRecordingsVideo(deviceId, params) {
            return signedDownload(
                client.devices.recordings.video(params.recordingId, { deviceId }, signedDownloadOpts),
            );
        },
        async manageDeviceScreenshotsImage(deviceId, params) {
            return signedDownload(
                client.devices.screenshots.image(params.screenshotId, { deviceId }, signedDownloadOpts),
            );
        },
        async manageDeviceStop(deviceId) {
            await client.devices.stop(deviceId);
            return { success: true };
        },
        async manageDeviceResume(deviceId) {
            await client.devices.resume(deviceId);
            return { success: true };
        },
        async manageDeviceSummary(params) {
            return client.devices.summary({ state: params.state });
        },
        async manageDeviceRetrieveCapabilities(deviceId) {
            return client.devices.retrieveCapabilities(deviceId);
        },
        async deviceActionClipboardGet(deviceId, params) {
            return client.devices.clipboard.get(deviceId, {
                ...headerOpts(params.displayId),
            });
        },
        async deviceActionClipboardSet(deviceId, params) {
            await client.devices.clipboard.set(deviceId, {
                text: params.text,
                ...headerOpts(params.displayId),
            });
            return { success: true };
        },
        async deviceActionDeepLink(deviceId, params) {
            await client.devices.deepLink.executeDeepLink(deviceId, {
                deepLink: params.deepLink,
                action: params.action,
                bundleId: params.bundleId,
                packageName: params.packageName,
                ...headerOpts(params.displayId),
            });
            return { success: true };
        },
        async deviceActionBrowserScript(deviceId, params) {
            return client.devices.browser.executeScript(deviceId, {
                script: params.script,
                ...headerOpts(params.displayId),
            });
        },
        async manageDeviceAppsGrantPermission(deviceId, params) {
            await client.devices.apps.grantPermission(params.permission, {
                deviceId,
                packageName: params.packageName,
                ...headerOpts(params.displayId),
            });
            return { success: true };
        },
        async manageDeviceAppsRevokePermission(deviceId, params) {
            await client.devices.apps.revokePermission(params.permission, {
                deviceId,
                packageName: params.packageName,
                ...headerOpts(params.displayId),
            });
            return { success: true };
        },
        async manageDeviceAppsListInstalls(deviceId, params) {
            return client.devices.apps.listInstalls(deviceId, {
                ...headerOpts(params.displayId),
            });
        },
        async configureDeviceResetLocation(deviceId, params) {
            await client.devices.location.reset(deviceId, {
                ...headerOpts(params.displayId),
            });
            return { success: true };
        },
        async configureDeviceKioskEnable(deviceId, params) {
            await client.devices.kiosk.enable(deviceId, {
                packageName: params.packageName,
                ...headerOpts(params.displayId),
            });
            return { success: true };
        },
        async configureDeviceKioskDisable(deviceId, params) {
            await client.devices.kiosk.disable(deviceId, {
                ...headerOpts(params.displayId),
            });
            return { success: true };
        },
        async configureDeviceUpdateProfile(deviceId, params) {
            await client.devices.profile.update(deviceId, {
                profileId: params.profileId,
                ...headerOpts(params.displayId),
            });
            return { success: true };
        },
        async manageEsimSetRoaming(deviceId, params) {
            await client.devices.esim.setRoaming(deviceId, {
                enabled: params.enabled,
                ...headerOpts(params.displayId),
            });
            return { success: true };
        },
        async manageEsimStatus(deviceId, params) {
            return client.devices.esim.status(deviceId, {
                ...headerOpts(params.displayId),
            });
        },
        async manageEsimApnList(deviceId, params) {
            return client.devices.esim.apn.list(deviceId, {
                ...headerOpts(params.displayId),
            });
        },
        async manageEsimApnSelect(deviceId, params) {
            await client.devices.esim.apn.select(deviceId, {
                apnId: params.apnId,
                subId: params.subId,
                ...headerOpts(params.displayId),
            });
            return { success: true };
        },
        async manageEsimApnSet(deviceId, params) {
            await client.devices.esim.apn.set(deviceId, {
                apn: params.apn,
                mcc: params.mcc,
                mnc: params.mnc,
                name: params.name,
                protocol: params.protocol,
                roamingProtocol: params.roamingProtocol,
                subId: params.subId,
                type: params.type,
                ...headerOpts(params.displayId),
            });
            return { success: true };
        },
        async manageDeviceRecordingsList(deviceId, params) {
            return client.devices.recordings.list(deviceId, { status: params.status, type: params.type });
        },
        async manageDeviceRecordingsDelete(deviceId, params) {
            await client.devices.recordings.delete(params.recordingId, { deviceId });
            return { success: true };
        },
        async manageDeviceRecordingsScreenshots(deviceId, params) {
            return client.devices.recordings.screenshots(params.recordingId, { deviceId });
        },
        async manageDeviceRecordingsStart(deviceId, params) {
            return client.devices.recordings.start(deviceId, {
                name: params.name,
                quality: params.quality,
                retentionDays: params.retentionDays,
                types: params.types,
            });
        },
        async manageDeviceRecordingsStatus(deviceId, params) {
            return client.devices.recordings.status(params.recordingId, { deviceId });
        },
        async manageDeviceRecordingsStop(deviceId, params) {
            return client.devices.recordings.stop(params.recordingId, { deviceId });
        },
        async manageDeviceScreenshotsList(deviceId, params) {
            return client.devices.screenshots.list(deviceId, { cursor: params.cursor, limit: params.limit });
        },
        async manageDeviceScreenshotsDelete(deviceId, params) {
            await client.devices.screenshots.delete(params.screenshotId, { deviceId });
            return { success: true };
        },
        async manageDeviceScreenshotsCapture(deviceId, params) {
            return captureDeviceScreenshot(client, deviceId, params);
        },
        async manageDeviceTrafficSessionsCreate(deviceId, params) {
            return client.devices.trafficSessions.create(deviceId, {
                expiresInSeconds: params.expiresInSeconds,
                maxBodyBytes: params.maxBodyBytes,
            });
        },
        async manageDeviceTrafficSessionsRetrieve(deviceId, params) {
            return client.devices.trafficSessions.retrieve(params.sessionId, { deviceId });
        },
        async manageDeviceTrafficSessionsList(deviceId, params) {
            return client.devices.trafficSessions.list(deviceId, {
                page: params.page,
                pageSize: params.pageSize,
            });
        },
        async manageDeviceTrafficSessionsDelete(deviceId, params) {
            return client.devices.trafficSessions.delete(params.sessionId, { deviceId });
        },
        async manageDeviceMediaSessionsCreate(deviceId, params) {
            return client.devices.mediaSessions.create(deviceId, {
                camera: params.camera,
                microphone: params.microphone,
            });
        },
        async manageDeviceMediaSessionsDelete(deviceId, params) {
            await client.devices.mediaSessions.delete(params.sessionId, {
                deviceId,
                'X-Media-Control-Token': params.controlToken,
            });
            return { success: true };
        },
        async manageDeviceMediaSessionsActivate(deviceId, params) {
            return client.devices.mediaSessions.activate(params.sessionId, {
                deviceId,
                'X-Media-Control-Token': params.controlToken,
            });
        },
        async manageDeviceMediaSessionsRetrieveCurrent(deviceId) {
            return client.devices.mediaSessions.retrieveCurrent(deviceId);
        },
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
                humanize: params.stealth,
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
                humanize: params.stealth,
                ...headerOpts(params.displayId),
            });
        },
        async keyboardWrite(params: DeviceActionParams) {
            await client.devices.keyboard.write(params.deviceId, {
                text: params.text!,
                clear: params.clear,
                errorRate: params.errorRate,
                wpm: params.wpm,
                humanize: params.stealth,
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
            await client.devices.actions.global(params.deviceId, {
                action: params.action!,
                ...headerOpts(params.displayId),
            });
        },

        // manage_device_apps
        async installApp(deviceId, opts: AppInstallOpts) {
            // SDK's AppInstallParams is a discriminated union requiring one of
            // packageName/bundleId as the "primary" key — either works with
            // the other optional, so this cast is safe for our "at least one"
            // validation already done at the tool layer.
            await client.devices.apps.install(deviceId, {
                packageName: opts.packageName,
                bundleId: opts.bundleId,
            } as Parameters<typeof client.devices.apps.install>[1]);
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
            await client.devices.proxy.connect(deviceId, {
                name: opts.name,
                smartIp: opts.smartIp,
                socks5: opts.socks5,
            });
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
