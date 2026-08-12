// Devices port — narrow, per-domain Backend interface (interface
// segregation), NOT the whole @mobilerun/sdk client. Tool handlers in
// ../tools/devices.ts call only these methods; DTOs below are minimal
// mirrors of what @mobilerun/sdk's shipped .d.ts returns, trimmed to the
// fields the tools actually surface — this is a semantic tool-capability
// contract, not a full SDK type mirror. Extending a DTO with a new optional
// field is a minor change under this package's semver rules (see CONTRACT.md).

export type DeviceState =
    | 'creating'
    | 'assigned'
    | 'ready'
    | 'rebooting'
    | 'migrating'
    | 'resetting'
    | 'terminated'
    | 'maintenance'
    | 'unknown';

// Mirrors @mobilerun/sdk's DeviceCreateParams.deviceType / DeviceListParams.type
// union exactly (verified against the SDK's shipped .d.ts — see SdkBackend).
export type DeviceType = 'dedicated_physical_device' | 'dedicated_premium_device' | 'dedicated_ios_device';

export interface ListDevicesOpts {
    state?: readonly DeviceState[];
    type?: DeviceType;
    name?: string;
    country?: string;
    page?: number;
    pageSize?: number;
}

export interface ListAppsOnDeviceOpts {
    includeSystemApps?: boolean;
    includeProtectedApps?: boolean;
}

export interface CreateDeviceOpts {
    deviceType?: DeviceType;
    name?: string;
    country?: string;
}

/** Pagination envelope shared by every list endpoint (mirrors @mobilerun/sdk's `Shared.Pagination`/`Shared.Meta`). */
export interface PageMeta {
    page: number;
    pages: number;
    pageSize: number;
    total: number;
    hasNext: boolean;
    hasPrev: boolean;
}

export interface DeviceDto {
    id: string;
    name: string;
    state: string;
    type: string;
    createdAt: string;
    assignedAt: string | null;
    terminatesAt: string | null;
    streamUrl?: string;
    taskCount?: number;
    activeTaskId?: string;
    stateMessage?: string;
    providerId?: string;
}

export interface DeviceListDto {
    items: DeviceDto[] | null;
    pagination: PageMeta;
}

export interface DeviceScreenshotDto {
    deviceId: string;
    /** Raw SDK screenshot result — base64 payload or a signed URL, shape undocumented upstream (see README caveat). */
    screenshot: string;
}

/** Raw a11y-tree UI-state response — loosely typed defensively, compacted client-side by ../tools/ui-state.ts. */
export interface DeviceUiStateDto {
    a11y_tree?: unknown;
    phone_state?: {
        currentApp?: string;
        activityName?: string;
        keyboardVisible?: boolean;
        isEditable?: boolean;
        focusedElement?: { className?: string; resourceId?: string; text?: string };
    };
    device_context?: {
        screen_bounds?: { width?: number; height?: number };
    };
}

export interface DeviceAppDto {
    packageName: string;
    label: string;
    versionName: string;
    versionCode: number;
    isSystemApp: boolean;
}

// @mobilerun/sdk's apps.list returns a bare array (or null), not an
// `{ items }` envelope — verified against devices/apps.d.ts.
export type DeviceAppListDto = DeviceAppDto[] | null;

export interface DeviceTerminateResultDto {
    status: 'termination_requested';
    deviceId: string;
}

export interface DevicesBackend {
    listDevices(opts: ListDevicesOpts): Promise<DeviceListDto>;
    getDevice(deviceId: string): Promise<DeviceDto>;
    getDeviceScreenshot(deviceId: string): Promise<DeviceScreenshotDto>;
    getDeviceUiState(deviceId: string): Promise<DeviceUiStateDto>;
    listAppsOnDevice(deviceId: string, opts: ListAppsOnDeviceOpts): Promise<DeviceAppListDto>;
    createDevice(opts: CreateDeviceOpts): Promise<DeviceDto>;
    terminateDevice(deviceId: string): Promise<DeviceTerminateResultDto>;
}
