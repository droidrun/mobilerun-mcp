import { MANAGE_DEVICE_SHARED_FIELDS, MANAGE_DEVICE_TABLE } from './manage-device-operations.js';
import { DEVICE_ACTION_SHARED_FIELDS, DEVICE_ACTION_TABLE } from './device-action-operations.js';
import { MANAGE_APPS_SHARED_FIELDS, MANAGE_APPS_TABLE } from './manage-device-apps-operations.js';
import { MANAGE_FILES_SHARED_FIELDS, MANAGE_FILES_TABLE } from './manage-device-files-operations.js';
import { CONFIGURE_DEVICE_SHARED_FIELDS, CONFIGURE_DEVICE_TABLE } from './configure-device-operations.js';
import { MANAGE_ESIM_SHARED_FIELDS, MANAGE_ESIM_TABLE } from './manage-esim-operations.js';
import { registerBundle } from './operation-table.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolCtx } from '../ctx.js';

export function registerDeviceControlTools(server: McpServer, ctx: ToolCtx): void {
    registerBundle(server, ctx, 'manage_device', MANAGE_DEVICE_TABLE, { shared: MANAGE_DEVICE_SHARED_FIELDS, checkFields: true });
    registerBundle(server, ctx, 'device_action', DEVICE_ACTION_TABLE, { shared: DEVICE_ACTION_SHARED_FIELDS, checkFields: true });
    registerBundle(server, ctx, 'manage_device_apps', MANAGE_APPS_TABLE, { shared: MANAGE_APPS_SHARED_FIELDS, checkFields: true });
    registerBundle(server, ctx, 'manage_device_files', MANAGE_FILES_TABLE, { shared: MANAGE_FILES_SHARED_FIELDS, checkFields: true });
    registerBundle(server, ctx, 'configure_device', CONFIGURE_DEVICE_TABLE, { shared: CONFIGURE_DEVICE_SHARED_FIELDS, checkFields: true });
    registerBundle(server, ctx, 'manage_esim', MANAGE_ESIM_TABLE, { shared: MANAGE_ESIM_SHARED_FIELDS, checkFields: true });
}
