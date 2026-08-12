// Device-control port — see devices.ts's file header for the DTO
// philosophy. Backs the device-control bundle tools:
// manage_device, device_action, manage_device_apps, manage_device_files,
// configure_device, manage_esim. `profiles` has its own port (profiles.ts)
// since it isn't device-scoped the same way (profile CRUD lives at
// /profiles, only `apply` touches a device).
//
// Every method here was verified against @mobilerun/sdk 5.1.0's shipped
// .d.ts — see the header comment in
// ../tools/device-control.ts for the full list of originally-sketched
// operations that turned out to have no SDK-side surface at all and were
// dropped rather than stubbed. In particular: `device_recordings`
// (list/start/get/stop/delete/trajectory/video) has zero SDK support — no
// `recordings` resource exists anywhere in the client — so that entire
// bundle tool is NOT built here or registered anywhere.

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
    stealth?: boolean;
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
    /** Raw SDK response — shape (base64 vs plain text) is undocumented upstream, same open caveat as the device screenshot tool. */
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
    // manage_device
    rebootDevice(deviceId: string): Promise<void>;
    resetDevice(deviceId: string): Promise<void>;
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
