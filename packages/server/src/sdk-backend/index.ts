import type Mobilerun from '@mobilerun/sdk';
import type { Backend } from '@mobilerun/mcp-tools';
import { createAppsBackend } from './apps.js';
import { createConnectBackend } from './connect.js';
import { createCredentialsBackend } from './credentials.js';
import { createDeviceControlBackend } from './device-control.js';
import { createDevicesBackend } from './devices.js';
import { withBackendErrors } from './errors.js';
import { createPlatformCatalogBackend } from './platform-catalog.js';
import { createProxiesBackend } from './proxies.js';
import { createTasksBackend } from './tasks.js';
import { createWebhooksBackend } from './webhooks.js';
import { createWorkflowsBackend } from './workflows.js';

/**
 * Backend implementation over @mobilerun/sdk's `Mobilerun` client — the
 * public-MCP half of this package's auth composition (Bearer -> SDK client ->
 * SdkBackend -> ToolCtx -> buildMcpServer). Split per domain so each new
 * domain can add its own
 * `sdk-backend/<domain>.ts` + one-line registration here with minimal
 * conflict surface. Every domain is wrapped in `withBackendErrors` so a
 * thrown SDK error becomes a typed `BackendError` before it reaches the
 * tool layer.
 */
export function createSdkBackend(client: Mobilerun): Backend {
    return {
        devices: withBackendErrors(createDevicesBackend(client)),
        workflows: withBackendErrors(createWorkflowsBackend(client)),
        webhooks: withBackendErrors(createWebhooksBackend(client)),
        credentials: withBackendErrors(createCredentialsBackend(client)),
        tasks: withBackendErrors(createTasksBackend(client)),
        deviceControl: withBackendErrors(createDeviceControlBackend(client)),
        apps: withBackendErrors(createAppsBackend(client)),
        proxies: withBackendErrors(createProxiesBackend(client)),
        connect: withBackendErrors(createConnectBackend(client)),
        platformCatalog: withBackendErrors(createPlatformCatalogBackend(client)),
    };
}
