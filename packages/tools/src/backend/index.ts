// Barrel composing the domain ports into the one `Backend` type ToolCtx
// consumes. Adding a new domain is: add
// `backend/<domain>.ts` with its DTOs + `<Domain>Backend` interface, then
// register it here (one import + one field) — a deliberately low-conflict
// surface so parallel domain work doesn't collide beyond a one-line addition.
export * from './errors.js';
export * from './devices.js';
export * from './workflows.js';
export * from './webhooks.js';
export * from './credentials.js';
export * from './tasks.js';
export * from './device-control.js';
export * from './profiles.js';
export * from './apps.js';
export * from './proxies.js';
export * from './connect.js';
export * from './platform-catalog.js';

import type { DevicesBackend } from './devices.js';
import type { WorkflowsBackend } from './workflows.js';
import type { WebhooksBackend } from './webhooks.js';
import type { CredentialsBackend } from './credentials.js';
import type { TasksBackend } from './tasks.js';
import type { DeviceControlBackend } from './device-control.js';
import type { ProfilesBackend } from './profiles.js';
import type { AppsBackend } from './apps.js';
import type { ProxiesBackend } from './proxies.js';
import type { ConnectBackend } from './connect.js';
import type { PlatformCatalogBackend } from './platform-catalog.js';

export type Backend = {
    devices: DevicesBackend;
    workflows: WorkflowsBackend;
    webhooks: WebhooksBackend;
    credentials: CredentialsBackend;
    tasks: TasksBackend;
    deviceControl: DeviceControlBackend;
    profiles: ProfilesBackend;
    apps: AppsBackend;
    proxies: ProxiesBackend;
    connect: ConnectBackend;
    platformCatalog: PlatformCatalogBackend;
};
