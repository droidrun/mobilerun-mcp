// Device-control bundle tools: manage_device, device_action,
// manage_device_apps, manage_device_files, configure_device, manage_esim.
//
// Every operation below was verified directly against @mobilerun/sdk 5.1.0's
// shipped .d.ts — several operations that were originally sketched for this
// bundle don't exist on the public client and are deliberately dropped:
//
//   - manage_device: `get_capabilities` dispatches to
//     `client.devices.fingerprint` — the SDK has no separate "capabilities"
//     endpoint; "fingerprint" (carrier/display/identifiers/model snapshot)
//     is the closest and only match for a capabilities read.
//   - device_action: "open deeplink" and "browser/execute-script" were
//     originally sketched among its values — neither exists anywhere in the
//     SDK (no deeplink-open or script-execution method on any devices
//     sub-resource). Dropped. The 6 operations that DO exist across
//     `client.devices.actions` (tap, swipe, global) and
//     `client.devices.keyboard` (write, key, clear) are built instead.
//     Overlay show/hide (`client.devices.actions.overlayVisible` /
//     `setOverlayVisible`) is NOT here — it's built under configure_device
//     instead (see below), even though the SDK physically groups the
//     overlay methods on the `Actions` resource.
//   - manage_device_apps: "grant/revoke permission" and "list
//     installs" were originally sketched — neither exists on
//     `client.devices.apps` or anywhere else in the SDK. Dropped.
//     install/delete/start/stop (`client.devices.apps.*`) and list_packages
//     (`client.devices.packages.list`) are built.
//   - manage_device_files: list, upload, download,
//     delete over `client.devices.files.*`.
//   - configure_device: a wider sketch (~20 ops, including "location reset",
//     "kiosk enable/disable", "fingerprint") doesn't hold up against the
//     shipped SDK:
//       - `location.reset` doesn't exist (only get/set).
//       - kiosk mode doesn't exist anywhere in the SDK.
//       - "fingerprint" is dropped here — it's the same
//         `client.devices.fingerprint` call already exposed as
//         manage_device's get_capabilities; this build surfaces it exactly
//         once rather than duplicating it.
//     What DOES exist and is built: language get/set, timezone get/set,
//     location get/set, time (get-only — `client.devices.state.time` has no
//     setter), overlay get/set (see device_action note above for why it's
//     here), and proxy connect/disconnect/status
//     (`client.devices.proxy.*`) — folded in here since it's config-shaped,
//     not an on-screen action. The "setting + get/set" cross-product
//     doesn't fit proxy (connect/disconnect/status, not get/set), so this
//     tool uses one flat `operation` enum instead, consistent with
//     webhooks/manage_device's established bundle-tool shape.
//   - manage_esim: a wider sketch of 9 operations including "APN
//     list/create/select", "roaming", "connectivity-status" — none of
//     those exist anywhere in the SDK (confirmed: no "apn"/"roaming"
//     string appears in the shipped client at all). Only
//     `client.devices.esim.{list,activate,enable,remove}` exist (4 ops).
//
// `device_recordings` (list/start/get/stop/delete/trajectory/video) is NOT
// built at all and NOT registered — there is no `recordings` resource,
// method, or route anywhere in the SDK. See
// ../backend/device-control.ts's header for the same note.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asErrorResult, asTextResult, ifDefined } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

function requireValue<T>(value: T | undefined, name: string, operation: string): T {
    if (value === undefined) throw new Error(`operation=${operation} requires ${name}`);
    return value;
}

/** Rejects any input key not on `allowed` for the chosen operation — fail-closed field allowlist, mirrors tools/workflows.ts's ALLOWED_FILTERS pattern. */
function disallowedFieldError(operation: string, allowed: readonly string[], allKeys: readonly string[], input: Record<string, unknown>): string | null {
    const extra = allKeys.filter((k) => input[k] !== undefined && !allowed.includes(k));
    if (extra.length === 0) return null;
    return `field ${extra.join(', ')} is not valid for operation=${operation}; allowed fields: ${allowed.join(', ') || '(none)'}`;
}

// Inline base64 payload cap for manage_device_files upload/download — the
// SDK has no presigned-URL alternative for device files (unlike this
// package's general principle of preferring short-lived URLs over base64
// in MCP JSON for binary responses: there is nothing to redirect to here),
// so this tool caps the raw payload instead. 256KB decoded, i.e. ~341,334
// base64 characters (4/3 expansion).
const MAX_INLINE_FILE_BYTES = 256 * 1024;
const MAX_INLINE_BASE64_CHARS = Math.ceil((MAX_INLINE_FILE_BYTES * 4) / 3);

// ---------------------------------------------------------------------------
// manage_device
// ---------------------------------------------------------------------------

const MANAGE_DEVICE_OPERATIONS = ['reboot', 'reset', 'rename', 'wait_ready', 'get_capabilities', 'count'] as const;
type ManageDeviceOperation = (typeof MANAGE_DEVICE_OPERATIONS)[number];
const MANAGE_DEVICE_FIELDS: Record<ManageDeviceOperation, readonly string[]> = {
    reboot: [],
    reset: [],
    rename: ['name'],
    wait_ready: [],
    get_capabilities: [],
    count: [],
};
const MANAGE_DEVICE_FIELD_KEYS = ['name'] as const;

function registerManageDevice(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_DEVICE_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device'));
    server.registerTool(
        'manage_device',
        {
            description:
                'Device lifecycle operations. Operations: reboot, reset (factory-reset to a fresh state — destructive), rename (needs name), wait_ready (blocks until state=ready), get_capabilities (fingerprint: carrier/display/identifiers/model snapshot), count (claimed-device counts by state — no deviceId).' +
                allowedValuesNote(values, MANAGE_DEVICE_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_DEVICE_OPERATIONS),
                deviceId: z.string().optional().describe('Required for every operation except count.'),
                name: z.string().max(64).optional(),
            },
        },
        async (input: { operation: ManageDeviceOperation; deviceId?: string; name?: string }) => {
            const { operation } = input;
            const fieldError = disallowedFieldError(operation, MANAGE_DEVICE_FIELDS[operation], MANAGE_DEVICE_FIELD_KEYS, input);
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.deviceControl;
            const devices = ctx.backend.devices;

            if (operation === 'count') return asTextResult(await backend.countDevices());

            const deviceId = requireValue(input.deviceId, 'deviceId', operation);
            if (operation === 'reboot') {
                await backend.rebootDevice(deviceId);
                return asTextResult({ status: 'reboot_requested', deviceId });
            }
            if (operation === 'reset') {
                await backend.resetDevice(deviceId);
                return asTextResult({ status: 'reset_requested', deviceId });
            }
            if (operation === 'rename') {
                const name = requireValue(input.name, 'name', operation);
                await backend.renameDevice(deviceId, name);
                return asTextResult(await devices.getDevice(deviceId));
            }
            if (operation === 'wait_ready') {
                await backend.waitDeviceReady(deviceId);
                return asTextResult(await devices.getDevice(deviceId));
            }
            return asTextResult(await backend.getDeviceCapabilities(deviceId));
        },
    );
}

// ---------------------------------------------------------------------------
// device_action
// ---------------------------------------------------------------------------

const DEVICE_ACTION_OPERATIONS = ['tap', 'swipe', 'keyboard_write', 'keyboard_key', 'keyboard_clear', 'global_action'] as const;
type DeviceActionOperation = (typeof DEVICE_ACTION_OPERATIONS)[number];
const DEVICE_ACTION_FIELDS: Record<DeviceActionOperation, readonly string[]> = {
    tap: ['x', 'y', 'stealth'],
    swipe: ['startX', 'startY', 'endX', 'endY', 'duration', 'stealth'],
    keyboard_write: ['text', 'clear', 'errorRate', 'stealth', 'wpm'],
    keyboard_key: ['key'],
    keyboard_clear: [],
    global_action: ['action'],
};
const DEVICE_ACTION_FIELD_KEYS = ['x', 'y', 'startX', 'startY', 'endX', 'endY', 'duration', 'stealth', 'text', 'clear', 'errorRate', 'wpm', 'key', 'action'] as const;

function registerDeviceAction(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(DEVICE_ACTION_OPERATIONS, ctx.policy.operationAllowlist?.get('device_action'));
    server.registerTool(
        'device_action',
        {
            description:
                'Low-level device input. Operations: tap (x, y), swipe (startX, startY, endX, endY, duration ms), keyboard_write (text, clear?, errorRate?, wpm?, stealth?), keyboard_key (key: Android keycode), keyboard_clear, global_action (action: Android global-action code, e.g. back/home/recents). stealth (tap/swipe/keyboard_write) requests human-like timing where the endpoint supports it. Per-call `displayId` targets a specific display on multi-display devices.' +
                allowedValuesNote(values, DEVICE_ACTION_OPERATIONS),
            inputSchema: {
                operation: z.enum(DEVICE_ACTION_OPERATIONS),
                deviceId: z.string(),
                displayId: z.number().int().optional(),
                x: z.number().optional(),
                y: z.number().optional(),
                startX: z.number().optional(),
                startY: z.number().optional(),
                endX: z.number().optional(),
                endY: z.number().optional(),
                duration: z.number().int().positive().optional().describe('Swipe duration in milliseconds.'),
                stealth: z.boolean().optional(),
                text: z.string().optional(),
                clear: z.boolean().optional().describe('keyboard_write: clear existing input before typing.'),
                errorRate: z.number().optional().describe('keyboard_write stealth typing: per-character mistake rate. -1 uses server default.'),
                wpm: z.number().optional().describe('keyboard_write stealth typing: words per minute. 0 uses portal default.'),
                key: z.number().int().optional().describe('keyboard_key: Android keycode.'),
                action: z.number().int().optional().describe('global_action: Android global-action code.'),
            },
        },
        async (input: { operation: DeviceActionOperation; deviceId: string; displayId?: number } & Record<string, unknown>) => {
            const { operation, deviceId, displayId } = input;
            const fieldError = disallowedFieldError(operation, DEVICE_ACTION_FIELDS[operation], DEVICE_ACTION_FIELD_KEYS, input);
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.deviceControl;
            const stealth = input.stealth as boolean | undefined;

            if (operation === 'tap') {
                await backend.tap({
                    deviceId,
                    displayId,
                    stealth,
                    x: requireValue(input.x as number | undefined, 'x', operation),
                    y: requireValue(input.y as number | undefined, 'y', operation),
                });
            } else if (operation === 'swipe') {
                await backend.swipe({
                    deviceId,
                    displayId,
                    stealth,
                    startX: requireValue(input.startX as number | undefined, 'startX', operation),
                    startY: requireValue(input.startY as number | undefined, 'startY', operation),
                    endX: requireValue(input.endX as number | undefined, 'endX', operation),
                    endY: requireValue(input.endY as number | undefined, 'endY', operation),
                    duration: requireValue(input.duration as number | undefined, 'duration', operation),
                });
            } else if (operation === 'keyboard_write') {
                await backend.keyboardWrite({
                    deviceId,
                    displayId,
                    stealth,
                    text: requireValue(input.text as string | undefined, 'text', operation),
                    clear: input.clear as boolean | undefined,
                    errorRate: input.errorRate as number | undefined,
                    wpm: input.wpm as number | undefined,
                });
            } else if (operation === 'keyboard_key') {
                await backend.keyboardKey({ deviceId, displayId, key: requireValue(input.key as number | undefined, 'key', operation) });
            } else if (operation === 'keyboard_clear') {
                await backend.keyboardClear(deviceId, displayId);
            } else {
                await backend.globalAction({ deviceId, displayId, action: requireValue(input.action as number | undefined, 'action', operation) });
            }
            return asTextResult({ status: 'ok', operation, deviceId });
        },
    );
}

// ---------------------------------------------------------------------------
// manage_device_apps
// ---------------------------------------------------------------------------

const MANAGE_APPS_OPERATIONS = ['install', 'delete', 'start', 'stop', 'list_packages'] as const;
type ManageAppsOperation = (typeof MANAGE_APPS_OPERATIONS)[number];
const MANAGE_APPS_FIELDS: Record<ManageAppsOperation, readonly string[]> = {
    install: ['packageName', 'bundleId'],
    delete: ['packageName'],
    start: ['packageName', 'activity'],
    stop: ['packageName'],
    list_packages: ['includeSystemPackages', 'includeProtectedPackages'],
};
const MANAGE_APPS_FIELD_KEYS = ['packageName', 'bundleId', 'activity', 'includeSystemPackages', 'includeProtectedPackages'] as const;

function registerManageDeviceApps(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_APPS_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device_apps'));
    server.registerTool(
        'manage_device_apps',
        {
            description:
                'Mutate apps on a device. Operations: install (packageName and/or bundleId — at least one), delete (packageName), start (packageName, activity?), stop (packageName), list_packages (raw installed package names, includeSystemPackages?, includeProtectedPackages?). Read app metadata (label, versions) via list_apps_on_device instead.' +
                allowedValuesNote(values, MANAGE_APPS_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_APPS_OPERATIONS),
                deviceId: z.string(),
                packageName: z.string().optional(),
                bundleId: z.string().optional().describe('iOS bundle identifier (install only).'),
                activity: z.string().optional().describe('start only: specific activity to launch.'),
                includeSystemPackages: z.boolean().optional(),
                includeProtectedPackages: z.boolean().optional(),
            },
        },
        async (input: { operation: ManageAppsOperation; deviceId: string } & Record<string, unknown>) => {
            const { operation, deviceId } = input;
            const fieldError = disallowedFieldError(operation, MANAGE_APPS_FIELDS[operation], MANAGE_APPS_FIELD_KEYS, input);
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.deviceControl;
            const packageName = input.packageName as string | undefined;
            const bundleId = input.bundleId as string | undefined;

            if (operation === 'install') {
                if (!packageName && !bundleId) throw new Error('operation=install requires packageName and/or bundleId');
                await backend.installApp(deviceId, { packageName, bundleId });
                return asTextResult({ status: 'install_requested', deviceId, packageName, bundleId });
            }
            if (operation === 'list_packages') {
                return asTextResult(
                    await backend.listPackages(deviceId, {
                        ...ifDefined('includeSystemPackages', input.includeSystemPackages as boolean | undefined),
                        ...ifDefined('includeProtectedPackages', input.includeProtectedPackages as boolean | undefined),
                    }),
                );
            }
            const pkg = requireValue(packageName, 'packageName', operation);
            if (operation === 'delete') {
                await backend.deleteApp(deviceId, pkg);
            } else if (operation === 'start') {
                await backend.startApp(deviceId, pkg, { activity: input.activity as string | undefined });
            } else {
                await backend.stopApp(deviceId, pkg);
            }
            return asTextResult({ status: 'ok', operation, deviceId, packageName: pkg });
        },
    );
}

// ---------------------------------------------------------------------------
// manage_device_files
// ---------------------------------------------------------------------------

const MANAGE_FILES_OPERATIONS = ['list', 'upload', 'download', 'delete'] as const;
type ManageFilesOperation = (typeof MANAGE_FILES_OPERATIONS)[number];
const MANAGE_FILES_FIELDS: Record<ManageFilesOperation, readonly string[]> = {
    list: [],
    upload: ['contentBase64', 'fileName', 'contentType'],
    download: [],
    delete: [],
};
const MANAGE_FILES_FIELD_KEYS = ['contentBase64', 'fileName', 'contentType'] as const;

function registerManageDeviceFiles(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_FILES_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device_files'));
    server.registerTool(
        'manage_device_files',
        {
            description:
                `Device filesystem access. Operations: list (directory entries at \`path\`), upload (write \`contentBase64\` to \`path\`; decoded payload capped at ${MAX_INLINE_FILE_BYTES / 1024}KB — larger files are rejected, no presigned-URL path exists on this SDK), download (read \`path\`; oversized results are rejected the same way — the raw SDK response has no documented base64-vs-text contract), delete (\`path\`). \`path\` is required for every operation.` +
                allowedValuesNote(values, MANAGE_FILES_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_FILES_OPERATIONS),
                deviceId: z.string(),
                path: z.string().min(1),
                contentBase64: z.string().max(MAX_INLINE_BASE64_CHARS).optional(),
                fileName: z.string().optional(),
                contentType: z.string().optional(),
            },
        },
        async (input: { operation: ManageFilesOperation; deviceId: string; path: string } & Record<string, unknown>) => {
            const { operation, deviceId, path } = input;
            const fieldError = disallowedFieldError(operation, MANAGE_FILES_FIELDS[operation], MANAGE_FILES_FIELD_KEYS, input);
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.deviceControl;
            if (operation === 'list') return asTextResult(await backend.listFiles(deviceId, { path }));
            if (operation === 'upload') {
                const contentBase64 = requireValue(input.contentBase64 as string | undefined, 'contentBase64', operation);
                if (contentBase64.length > MAX_INLINE_BASE64_CHARS) {
                    return asErrorResult(`upload payload exceeds the ${MAX_INLINE_FILE_BYTES / 1024}KB inline limit — use a smaller file.`);
                }
                await backend.uploadFile(deviceId, {
                    path,
                    contentBase64,
                    fileName: input.fileName as string | undefined,
                    contentType: input.contentType as string | undefined,
                });
                return asTextResult({ status: 'uploaded', deviceId, path });
            }
            if (operation === 'download') {
                const result = await backend.downloadFile(deviceId, path);
                if (result.content.length > MAX_INLINE_BASE64_CHARS) {
                    return asErrorResult(`device file at "${path}" exceeds the ${MAX_INLINE_FILE_BYTES / 1024}KB inline transfer limit.`);
                }
                return asTextResult(result);
            }
            await backend.deleteFile(deviceId, path);
            return asTextResult({ status: 'deleted', deviceId, path });
        },
    );
}

// ---------------------------------------------------------------------------
// configure_device
// ---------------------------------------------------------------------------

const CONFIGURE_DEVICE_OPERATIONS = [
    'get_language',
    'set_language',
    'get_timezone',
    'set_timezone',
    'get_location',
    'set_location',
    'get_time',
    'get_overlay',
    'set_overlay',
    'proxy_connect',
    'proxy_disconnect',
    'get_proxy_status',
] as const;
type ConfigureDeviceOperation = (typeof CONFIGURE_DEVICE_OPERATIONS)[number];
const CONFIGURE_DEVICE_FIELDS: Record<ConfigureDeviceOperation, readonly string[]> = {
    get_language: [],
    set_language: ['locale', 'restart'],
    get_timezone: [],
    set_timezone: ['timezone'],
    get_location: [],
    set_location: ['latitude', 'longitude'],
    get_time: [],
    get_overlay: [],
    set_overlay: ['visible'],
    proxy_connect: ['proxyName', 'smartIp', 'socks5Host', 'socks5Port', 'socks5User', 'socks5Password'],
    proxy_disconnect: [],
    get_proxy_status: [],
};
const CONFIGURE_DEVICE_FIELD_KEYS = [
    'locale',
    'restart',
    'timezone',
    'latitude',
    'longitude',
    'visible',
    'proxyName',
    'smartIp',
    'socks5Host',
    'socks5Port',
    'socks5User',
    'socks5Password',
] as const;

function registerConfigureDevice(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(CONFIGURE_DEVICE_OPERATIONS, ctx.policy.operationAllowlist?.get('configure_device'));
    server.registerTool(
        'configure_device',
        {
            description:
                'Read/write device settings. Operations: get_language/set_language (locale: BCP-47 e.g. en-US; restart? forces the change to apply immediately instead of on next reboot), get_timezone/set_timezone (IANA tz), get_location/set_location (latitude, longitude — no reset; use set_location again to change), get_time (read-only device clock), get_overlay/set_overlay (visible: the on-device debug/annotation overlay), proxy_connect (proxyName? and/or smartIp?, or socks5Host+socks5Port+socks5User?+socks5Password? for a SOCKS5 proxy), proxy_disconnect, get_proxy_status.' +
                allowedValuesNote(values, CONFIGURE_DEVICE_OPERATIONS),
            inputSchema: {
                operation: z.enum(CONFIGURE_DEVICE_OPERATIONS),
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
            },
        },
        async (input: { operation: ConfigureDeviceOperation; deviceId: string } & Record<string, unknown>) => {
            const { operation, deviceId } = input;
            const fieldError = disallowedFieldError(operation, CONFIGURE_DEVICE_FIELDS[operation], CONFIGURE_DEVICE_FIELD_KEYS, input);
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.deviceControl;
            switch (operation) {
                case 'get_language':
                    return asTextResult(await backend.getLanguage(deviceId));
                case 'set_language':
                    await backend.setLanguage(deviceId, {
                        locale: requireValue(input.locale as string | undefined, 'locale', operation),
                        restart: input.restart as boolean | undefined,
                    });
                    return asTextResult({ status: 'ok', operation, deviceId });
                case 'get_timezone':
                    return asTextResult(await backend.getTimezone(deviceId));
                case 'set_timezone':
                    await backend.setTimezone(deviceId, requireValue(input.timezone as string | undefined, 'timezone', operation));
                    return asTextResult({ status: 'ok', operation, deviceId });
                case 'get_location':
                    return asTextResult(await backend.getLocation(deviceId));
                case 'set_location':
                    await backend.setLocation(deviceId, {
                        latitude: requireValue(input.latitude as number | undefined, 'latitude', operation),
                        longitude: requireValue(input.longitude as number | undefined, 'longitude', operation),
                    });
                    return asTextResult({ status: 'ok', operation, deviceId });
                case 'get_time':
                    return asTextResult(await backend.getTime(deviceId));
                case 'get_overlay':
                    return asTextResult(await backend.getOverlay(deviceId));
                case 'set_overlay':
                    await backend.setOverlay(deviceId, requireValue(input.visible as boolean | undefined, 'visible', operation));
                    return asTextResult({ status: 'ok', operation, deviceId });
                case 'proxy_connect': {
                    const socks5Host = input.socks5Host as string | undefined;
                    const socks5Port = input.socks5Port as number | undefined;
                    await backend.connectProxy(deviceId, {
                        name: input.proxyName as string | undefined,
                        smartIp: input.smartIp as boolean | undefined,
                        socks5:
                            socks5Host && socks5Port !== undefined
                                ? { host: socks5Host, port: socks5Port, user: input.socks5User as string | undefined, password: input.socks5Password as string | undefined }
                                : undefined,
                    });
                    return asTextResult({ status: 'ok', operation, deviceId });
                }
                case 'proxy_disconnect':
                    await backend.disconnectProxy(deviceId);
                    return asTextResult({ status: 'ok', operation, deviceId });
                case 'get_proxy_status':
                    return asTextResult(await backend.getProxyStatus(deviceId));
            }
        },
    );
}

// ---------------------------------------------------------------------------
// manage_esim
// ---------------------------------------------------------------------------

const MANAGE_ESIM_OPERATIONS = ['list', 'activate', 'enable', 'remove'] as const;
type ManageEsimOperation = (typeof MANAGE_ESIM_OPERATIONS)[number];
const MANAGE_ESIM_FIELDS: Record<ManageEsimOperation, readonly string[]> = {
    list: [],
    activate: ['enable', 'smDpAddr', 'confirmationCode', 'matchingId'],
    enable: ['subId'],
    remove: ['subId'],
};
const MANAGE_ESIM_FIELD_KEYS = ['enable', 'smDpAddr', 'confirmationCode', 'matchingId', 'subId'] as const;

function registerManageEsim(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_ESIM_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_esim'));
    server.registerTool(
        'manage_esim',
        {
            description:
                'eSIM subscription management. Operations: list, activate (smDpAddr required, enable: whether to also enable the downloaded profile, confirmationCode?/matchingId? — confirmationCode requires matchingId, only needed when the SM-DP+ challenges for it), enable (subId), remove (subId). No APN, roaming, or connectivity-status operations exist on this SDK.' +
                allowedValuesNote(values, MANAGE_ESIM_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_ESIM_OPERATIONS),
                deviceId: z.string(),
                enable: z.boolean().optional(),
                smDpAddr: z.string().optional(),
                confirmationCode: z.string().optional(),
                matchingId: z.string().optional(),
                subId: z.number().int().optional(),
            },
        },
        async (input: { operation: ManageEsimOperation; deviceId: string } & Record<string, unknown>) => {
            const { operation, deviceId } = input;
            const fieldError = disallowedFieldError(operation, MANAGE_ESIM_FIELDS[operation], MANAGE_ESIM_FIELD_KEYS, input);
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.deviceControl;
            if (operation === 'list') return asTextResult(await backend.listEsims(deviceId));
            if (operation === 'activate') {
                return asTextResult(
                    await backend.activateEsim(deviceId, {
                        enable: requireValue(input.enable as boolean | undefined, 'enable', operation),
                        smDpAddr: requireValue(input.smDpAddr as string | undefined, 'smDpAddr', operation),
                        confirmationCode: input.confirmationCode as string | undefined,
                        matchingId: input.matchingId as string | undefined,
                    }),
                );
            }
            const subId = requireValue(input.subId as number | undefined, 'subId', operation);
            if (operation === 'enable') {
                await backend.enableEsim(deviceId, subId);
            } else {
                await backend.removeEsim(deviceId, subId);
            }
            return asTextResult({ status: 'ok', operation, deviceId, subId });
        },
    );
}

export function registerDeviceControlTools(server: McpServer, ctx: ToolCtx): void {
    registerManageDevice(server, ctx);
    registerDeviceAction(server, ctx);
    registerManageDeviceApps(server, ctx);
    registerManageDeviceFiles(server, ctx);
    registerConfigureDevice(server, ctx);
    registerManageEsim(server, ctx);
}
