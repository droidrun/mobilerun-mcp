// Semantic port for the six device-control bundles, including lifecycle,
// input, apps, files, configuration, eSIMs, recordings, screenshots and
// traffic sessions. DTOs contain only the fields surfaced by tools;
// operation tables live in tools/*-operations.ts, while the server adapter
// maps these capabilities to the public SDK.

import { z } from 'zod';

export interface DeviceCapabilitiesDto {
    carrier: Record<string, unknown>;
    display: { densityDpi?: number; height?: number; width?: number };
    identifiers: Record<string, unknown>;
    model: {
        aospVersion?: string;
        brand?: string;
        device?: string;
        hardware?: string;
        imageRepository?: string;
        manufacturer?: string;
        model?: string;
    };
}

/** `client.devices.count()` — a bare map of state -> count, not device-scoped. */
export type DeviceCountDto = Record<string, number>;

export interface OverlayVisibleDto {
    visible: boolean;
}

export interface DeviceActionParams {
    deviceId: string;
    displayId?: number;
    // tap
    x?: number;
    y?: number;
    // swipe
    startX?: number;
    startY?: number;
    endX?: number;
    endY?: number;
    duration?: number;
    humanize?: boolean;
    // keyboard_write
    text?: string;
    clear?: boolean;
    errorRate?: number;
    wpm?: number;
    // keyboard_key
    key?: number;
    // global_action
    action?: number;
}

export interface AppInstallOpts {
    packageName?: string;
    bundleId?: string;
}
export interface AppStartOpts {
    activity?: string;
}
export interface ListPackagesOpts {
    includeSystemPackages?: boolean;
    includeProtectedPackages?: boolean;
}
export type DevicePackageListDto = string[] | null;

export interface FileListOpts {
    path: string;
}
export interface FileInfoDto {
    name: string;
    type: string;
    size: number;
    modifiedAt: string;
    owner: string;
    group: string;
    hardLinks: number;
    extendedAttributes: boolean;
    symlinkTarget?: string;
}
export interface FileListDto {
    files: FileInfoDto[] | null;
    path: string;
    total: number;
}
export interface FileUploadOpts {
    path: string;
    /** Base64-encoded file content. Callers/tool layer enforce the inline-size cap before this reaches the backend. */
    contentBase64: string;
    fileName?: string;
    contentType?: string;
}
export interface FileDownloadDto {
    /** Base64-encoded file bytes, bounded by the decoded inline transfer limit. */
    content: string;
}

export interface SetLanguageOpts {
    locale: string;
    restart?: boolean;
}
export interface LocationDto {
    latitude: number;
    longitude: number;
}
export interface Socks5Opts {
    host: string;
    port: number;
    user?: string;
    password?: string;
}
export interface ProxyConnectOpts {
    name?: string;
    smartIp?: boolean;
    socks5?: Socks5Opts;
}
export interface ProxyStatusDto {
    connected: boolean;
    name: string | null;
    protocol: string | null;
}

export interface EsimSubscriptionDto {
    carrier: string;
    displayName: string;
    iccid: string;
    isEmbedded: boolean;
    slot: number;
    subId: number;
    type: string;
}
export type EsimListDto = EsimSubscriptionDto[] | null;
export interface EsimActivateOpts {
    enable: boolean;
    smDpAddr: string;
    confirmationCode?: string;
    matchingId?: string;
}

export interface DeviceControlBackend {
    manageDeviceRecordingsTrajectory(
        deviceId: string,
        params: z.infer<typeof manageDeviceRecordingsTrajectorySchema>,
    ): Promise<unknown>;
    manageDeviceRecordingsVideo(
        deviceId: string,
        params: z.infer<typeof manageDeviceRecordingsVideoSchema>,
    ): Promise<unknown>;
    manageDeviceScreenshotsImage(
        deviceId: string,
        params: z.infer<typeof manageDeviceScreenshotsImageSchema>,
    ): Promise<unknown>;
    manageDeviceStop(deviceId: string): Promise<unknown>;
    manageDeviceResume(deviceId: string): Promise<unknown>;
    manageDeviceSummary(params: z.infer<typeof manageDeviceSummarySchema>): Promise<unknown>;
    manageDeviceRetrieveCapabilities(deviceId: string): Promise<unknown>;
    deviceActionClipboardGet(
        deviceId: string,
        params: z.infer<typeof deviceActionClipboardGetSchema>,
    ): Promise<unknown>;
    deviceActionClipboardSet(
        deviceId: string,
        params: z.infer<typeof deviceActionClipboardSetSchema>,
    ): Promise<unknown>;
    deviceActionDeepLink(deviceId: string, params: z.infer<typeof deviceActionDeepLinkSchema>): Promise<unknown>;
    deviceActionBrowserScript(
        deviceId: string,
        params: z.infer<typeof deviceActionBrowserScriptSchema>,
    ): Promise<unknown>;
    manageDeviceAppsGrantPermission(
        deviceId: string,
        params: z.infer<typeof manageDeviceAppsGrantPermissionSchema>,
    ): Promise<unknown>;
    manageDeviceAppsRevokePermission(
        deviceId: string,
        params: z.infer<typeof manageDeviceAppsRevokePermissionSchema>,
    ): Promise<unknown>;
    manageDeviceAppsListInstalls(
        deviceId: string,
        params: z.infer<typeof manageDeviceAppsListInstallsSchema>,
    ): Promise<unknown>;
    configureDeviceResetLocation(
        deviceId: string,
        params: z.infer<typeof configureDeviceResetLocationSchema>,
    ): Promise<unknown>;
    configureDeviceKioskEnable(
        deviceId: string,
        params: z.infer<typeof configureDeviceKioskEnableSchema>,
    ): Promise<unknown>;
    configureDeviceKioskDisable(
        deviceId: string,
        params: z.infer<typeof configureDeviceKioskDisableSchema>,
    ): Promise<unknown>;
    configureDeviceUpdateProfile(
        deviceId: string,
        params: z.infer<typeof configureDeviceUpdateProfileSchema>,
    ): Promise<unknown>;
    manageEsimSetRoaming(deviceId: string, params: z.infer<typeof manageEsimSetRoamingSchema>): Promise<unknown>;
    manageEsimStatus(deviceId: string, params: z.infer<typeof manageEsimStatusSchema>): Promise<unknown>;
    manageEsimApnList(deviceId: string, params: z.infer<typeof manageEsimApnListSchema>): Promise<unknown>;
    manageEsimApnSelect(deviceId: string, params: z.infer<typeof manageEsimApnSelectSchema>): Promise<unknown>;
    manageEsimApnSet(deviceId: string, params: z.infer<typeof manageEsimApnSetSchema>): Promise<unknown>;
    manageDeviceRecordingsList(
        deviceId: string,
        params: z.infer<typeof manageDeviceRecordingsListSchema>,
    ): Promise<unknown>;
    manageDeviceRecordingsDelete(
        deviceId: string,
        params: z.infer<typeof manageDeviceRecordingsDeleteSchema>,
    ): Promise<unknown>;
    manageDeviceRecordingsScreenshots(
        deviceId: string,
        params: z.infer<typeof manageDeviceRecordingsScreenshotsSchema>,
    ): Promise<unknown>;
    manageDeviceRecordingsStart(
        deviceId: string,
        params: z.infer<typeof manageDeviceRecordingsStartSchema>,
    ): Promise<unknown>;
    manageDeviceRecordingsStatus(
        deviceId: string,
        params: z.infer<typeof manageDeviceRecordingsStatusSchema>,
    ): Promise<unknown>;
    manageDeviceRecordingsStop(
        deviceId: string,
        params: z.infer<typeof manageDeviceRecordingsStopSchema>,
    ): Promise<unknown>;
    manageDeviceScreenshotsList(
        deviceId: string,
        params: z.infer<typeof manageDeviceScreenshotsListSchema>,
    ): Promise<unknown>;
    manageDeviceScreenshotsDelete(
        deviceId: string,
        params: z.infer<typeof manageDeviceScreenshotsDeleteSchema>,
    ): Promise<unknown>;
    manageDeviceScreenshotsCapture(
        deviceId: string,
        params: z.infer<typeof manageDeviceScreenshotsCaptureSchema>,
    ): Promise<{ mimeType: 'image/png'; contentBase64: string }>;
    manageDeviceTrafficSessionsCreate(
        deviceId: string,
        params: z.infer<typeof manageDeviceTrafficSessionsCreateSchema>,
    ): Promise<unknown>;
    manageDeviceTrafficSessionsRetrieve(
        deviceId: string,
        params: z.infer<typeof manageDeviceTrafficSessionsRetrieveSchema>,
    ): Promise<unknown>;
    manageDeviceTrafficSessionsList(
        deviceId: string,
        params: z.infer<typeof manageDeviceTrafficSessionsListSchema>,
    ): Promise<unknown>;
    manageDeviceTrafficSessionsDelete(
        deviceId: string,
        params: z.infer<typeof manageDeviceTrafficSessionsDeleteSchema>,
    ): Promise<unknown>;
    // manage_device
    rebootDevice(deviceId: string): Promise<void>;
    resetDevice(deviceId: string, mode?: 'full' | 'identity'): Promise<void>;
    renameDevice(deviceId: string, name: string): Promise<void>;
    waitDeviceReady(deviceId: string): Promise<void>;
    getDeviceCapabilities(deviceId: string): Promise<DeviceCapabilitiesDto>;
    countDevices(): Promise<DeviceCountDto>;

    // device_action
    tap(params: DeviceActionParams): Promise<void>;
    swipe(params: DeviceActionParams): Promise<void>;
    keyboardWrite(params: DeviceActionParams): Promise<void>;
    keyboardKey(params: DeviceActionParams): Promise<void>;
    keyboardClear(deviceId: string, displayId?: number): Promise<void>;
    globalAction(params: DeviceActionParams): Promise<void>;

    // manage_device_apps
    installApp(deviceId: string, opts: AppInstallOpts): Promise<void>;
    deleteApp(deviceId: string, packageName: string): Promise<void>;
    startApp(deviceId: string, packageName: string, opts: AppStartOpts): Promise<void>;
    stopApp(deviceId: string, packageName: string): Promise<void>;
    listPackages(deviceId: string, opts: ListPackagesOpts): Promise<DevicePackageListDto>;

    // manage_device_files
    listFiles(deviceId: string, opts: FileListOpts): Promise<FileListDto>;
    uploadFile(deviceId: string, opts: FileUploadOpts): Promise<void>;
    downloadFile(deviceId: string, path: string): Promise<FileDownloadDto>;
    deleteFile(deviceId: string, path: string): Promise<void>;

    // configure_device
    getLanguage(deviceId: string): Promise<{ locale: string }>;
    setLanguage(deviceId: string, opts: SetLanguageOpts): Promise<void>;
    getTimezone(deviceId: string): Promise<{ timezone: string | null }>;
    setTimezone(deviceId: string, timezone: string): Promise<void>;
    getLocation(deviceId: string): Promise<LocationDto>;
    setLocation(deviceId: string, opts: LocationDto): Promise<void>;
    getTime(deviceId: string): Promise<{ time: string }>;
    getOverlay(deviceId: string): Promise<OverlayVisibleDto>;
    setOverlay(deviceId: string, visible: boolean): Promise<void>;
    connectProxy(deviceId: string, opts: ProxyConnectOpts): Promise<void>;
    disconnectProxy(deviceId: string): Promise<void>;
    getProxyStatus(deviceId: string): Promise<ProxyStatusDto>;

    // manage_esim
    listEsims(deviceId: string): Promise<EsimListDto>;
    activateEsim(deviceId: string, opts: EsimActivateOpts): Promise<EsimSubscriptionDto>;
    enableEsim(deviceId: string, subId: number): Promise<void>;
    removeEsim(deviceId: string, subId: number): Promise<void>;
}

export const manageDeviceStopSchema = z.object({}).strict();

export const manageDeviceResumeSchema = z.object({}).strict();

export const manageDeviceSummarySchema = z
    .object({
        state: z
            .union([
                z.array(
                    z.union([
                        z.literal('creating'),
                        z.literal('assigned'),
                        z.literal('ready'),
                        z.literal('rebooting'),
                        z.literal('migrating'),
                        z.literal('resetting'),
                        z.literal('terminated'),
                        z.literal('maintenance'),
                        z.literal('stopped'),
                        z.literal('unknown'),
                    ]),
                ),
                z.null(),
            ])
            .optional(),
    })
    .strict();

export const manageDeviceRetrieveCapabilitiesSchema = z.object({}).strict();

export const deviceActionClipboardGetSchema = z
    .object({
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const deviceActionClipboardSetSchema = z
    .object({
        text: z.string(),
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const deviceActionDeepLinkSchema = z
    .object({
        deepLink: z.string(),
        action: z.string().optional(),
        bundleId: z.string().optional(),
        packageName: z.string().optional(),
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const deviceActionBrowserScriptSchema = z
    .object({
        script: z.string(),
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const manageDeviceAppsGrantPermissionSchema = z
    .object({
        permission: z.literal('POST_NOTIFICATIONS'),
        packageName: z.string(),
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const manageDeviceAppsRevokePermissionSchema = z
    .object({
        permission: z.literal('POST_NOTIFICATIONS'),
        packageName: z.string(),
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const manageDeviceAppsListInstallsSchema = z
    .object({
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const configureDeviceResetLocationSchema = z
    .object({
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const configureDeviceKioskEnableSchema = z
    .object({
        packageName: z.string(),
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const configureDeviceKioskDisableSchema = z
    .object({
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const configureDeviceUpdateProfileSchema = z
    .object({
        profileId: z.string(),
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const manageEsimSetRoamingSchema = z
    .object({
        enabled: z.boolean(),
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const manageEsimStatusSchema = z
    .object({
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const manageEsimApnListSchema = z
    .object({
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const manageEsimApnSelectSchema = z
    .object({
        apnId: z.number(),
        subId: z.number(),
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const manageEsimApnSetSchema = z
    .object({
        apn: z.string(),
        mcc: z.string(),
        mnc: z.string(),
        name: z.string(),
        protocol: z.string(),
        roamingProtocol: z.string(),
        subId: z.number(),
        type: z.string(),
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const manageDeviceRecordingsListSchema = z
    .object({
        status: z.string().optional(),
        type: z.string().optional(),
    })
    .strict();

export const manageDeviceRecordingsDeleteSchema = z
    .object({
        recordingId: z.string(),
    })
    .strict();

export const manageDeviceRecordingsScreenshotsSchema = z
    .object({
        recordingId: z.string(),
    })
    .strict();

export const manageDeviceRecordingsStartSchema = z
    .object({
        name: z.string().optional(),
        quality: z.number().optional(),
        retentionDays: z.number().optional(),
        types: z.union([z.array(z.string()), z.null()]).optional(),
    })
    .strict();

export const manageDeviceRecordingsStatusSchema = z
    .object({
        recordingId: z.string(),
    })
    .strict();

export const manageDeviceRecordingsStopSchema = z
    .object({
        recordingId: z.string(),
    })
    .strict();

export const manageDeviceScreenshotsListSchema = z
    .object({
        cursor: z.string().optional(),
        limit: z.number().int().positive().max(100).optional(),
    })
    .strict();

export const manageDeviceScreenshotsDeleteSchema = z
    .object({
        screenshotId: z.string(),
    })
    .strict();

export const manageDeviceScreenshotsCaptureSchema = z
    .object({
        hideOverlay: z.boolean().optional(),
        save: z.boolean().optional(),
        displayId: z.number().int().nonnegative().optional(),
    })
    .strict();

export const manageDeviceTrafficSessionsCreateSchema = z
    .object({
        expiresInSeconds: z.number().optional(),
        maxBodyBytes: z.number().optional(),
    })
    .strict();

export const manageDeviceTrafficSessionsRetrieveSchema = z
    .object({
        sessionId: z.string(),
    })
    .strict();

export const manageDeviceTrafficSessionsListSchema = z
    .object({
        page: z.number().int().positive().optional(),
        pageSize: z.number().int().positive().max(100).optional(),
    })
    .strict();

export const manageDeviceTrafficSessionsDeleteSchema = z
    .object({
        sessionId: z.string(),
    })
    .strict();

export const manageDeviceScreenshotsImageSchema = z.object({ screenshotId: z.string() }).strict();

export const manageDeviceRecordingsVideoSchema = z.object({ recordingId: z.string() }).strict();

export const manageDeviceRecordingsTrajectorySchema = z.object({ recordingId: z.string() }).strict();
