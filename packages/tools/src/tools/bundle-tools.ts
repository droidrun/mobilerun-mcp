import type { Operation } from './operation-table.js';
import { APPS_TABLE } from './apps.js';
import { ASSISTANT_TABLE } from './assistant.js';
import { CONFIGURE_DEVICE_TABLE } from './configure-device-operations.js';
import { CONNECT_TABLE } from './connect.js';
import { MANAGE_CREDENTIALS_TABLE } from './credentials.js';
import { DEVICE_ACTION_TABLE } from './device-action-operations.js';
import { FILES_TABLE } from './files.js';
import { MAILBOXES_TABLE } from './mailboxes.js';
import { MANAGE_APPS_TABLE } from './manage-device-apps-operations.js';
import { MANAGE_FILES_TABLE } from './manage-device-files-operations.js';
import { MANAGE_DEVICE_TABLE } from './manage-device-operations.js';
import { MANAGE_ESIM_TABLE } from './manage-esim-operations.js';
import { MANAGE_FLOW_TABLE } from './manage-flow.js';
import { MESSAGES_TABLE } from './messages.js';
import { NUMBERS_TABLE } from './numbers.js';
import { PLATFORM_CATALOG_TABLE } from './platform-catalog.js';
import { PROXIES_TABLE } from './proxies.js';
import { GET_TASK_MEDIA_TABLE, GET_TASK_TABLE } from './tasks.js';
import { WEBHOOK_TABLE } from './webhooks.js';
import { WORKFLOW_EVENTS_TABLE } from './workflow-events.js';
import { GET_WORKFLOW_RESOURCE_TABLE, LIST_WORKFLOW_RESOURCES_TABLE } from './workflows.js';

/** Static registration metadata: bundles own operation access; standalone tools own one access value. Every tool carries its display title. */
export const TOOL_METADATA = [
    { name: 'numbers', title: 'Manage Numbers', field: 'operation', operations: NUMBERS_TABLE },
    { name: 'mailboxes', title: 'Manage Mailboxes', field: 'operation', operations: MAILBOXES_TABLE },
    { name: 'messages', title: 'Manage Messages', field: 'operation', operations: MESSAGES_TABLE },
    { name: 'files', title: 'Manage Files', field: 'operation', operations: FILES_TABLE },
    { name: 'list_devices', title: 'List Devices', access: 'read' },
    { name: 'get_device', title: 'Get Device', access: 'read' },
    { name: 'get_device_screenshot', title: 'Get Device Screenshot', access: 'read' },
    { name: 'get_device_ui_state', title: 'Get Device UI State', access: 'read' },
    { name: 'list_apps_on_device', title: 'List Device Apps', access: 'read' },
    { name: 'create_device', title: 'Create Device', access: 'commerce' },
    { name: 'terminate_device', title: 'Terminate Device', destructive: true, access: 'commerce' },
    { name: 'list_workflow_resources', title: 'List Workflow Resources', field: 'resource', operations: LIST_WORKFLOW_RESOURCES_TABLE },
    { name: 'get_workflow_resource', title: 'Get Workflow Resource', field: 'resource', operations: GET_WORKFLOW_RESOURCE_TABLE },
    { name: 'create_action', title: 'Create Action', access: 'write' },
    { name: 'create_trigger', title: 'Create Trigger', access: 'write' },
    { name: 'create_flow', title: 'Create Flow', access: 'write' },
    { name: 'manage_flow', title: 'Manage Flow', field: 'operation', operations: MANAGE_FLOW_TABLE },
    { name: 'workflow_events', title: 'Workflow Events', field: 'operation', operations: WORKFLOW_EVENTS_TABLE },
    { name: 'webhooks', title: 'Manage Webhooks', field: 'operation', operations: WEBHOOK_TABLE },
    { name: 'assistant', title: 'Assistant Sessions', field: 'operation', operations: ASSISTANT_TABLE },
    { name: 'list_credentials', title: 'List Credentials', access: 'read' },
    { name: 'list_credential_packages', title: 'List Credential Packages', access: 'read' },
    { name: 'run_task', title: 'Run Task', destructive: true, access: 'write' },
    { name: 'get_task', title: 'Get Task', field: 'view', operations: GET_TASK_TABLE },
    { name: 'list_tasks', title: 'List Tasks', access: 'read' },
    { name: 'stop_task', title: 'Stop Task', access: 'write' },
    { name: 'send_task_message', title: 'Send Task Message', destructive: true, access: 'write' },
    { name: 'get_task_media', title: 'Get Task Media', field: 'kind', operations: GET_TASK_MEDIA_TABLE },
    { name: 'manage_device', title: 'Manage Device', field: 'operation', operations: MANAGE_DEVICE_TABLE },
    { name: 'device_action', title: 'Device Action', field: 'operation', operations: DEVICE_ACTION_TABLE },
    { name: 'manage_device_apps', title: 'Manage Device Apps', field: 'operation', operations: MANAGE_APPS_TABLE },
    { name: 'manage_device_files', title: 'Manage Device Files', field: 'operation', operations: MANAGE_FILES_TABLE },
    { name: 'configure_device', title: 'Configure Device', field: 'operation', operations: CONFIGURE_DEVICE_TABLE },
    { name: 'manage_esim', title: 'Manage eSIM', field: 'operation', operations: MANAGE_ESIM_TABLE },
    { name: 'apps', title: 'Manage Apps', field: 'operation', operations: APPS_TABLE },
    { name: 'manage_credentials', title: 'Manage Credentials', field: 'operation', operations: MANAGE_CREDENTIALS_TABLE },
    { name: 'proxies', title: 'Manage Device Proxies', field: 'operation', operations: PROXIES_TABLE },
    { name: 'connect', title: 'Manage Connect Proxies', field: 'operation', operations: CONNECT_TABLE },
    { name: 'platform_catalog', title: 'Platform Catalog', field: 'catalog', operations: PLATFORM_CATALOG_TABLE },
] as const;

type Bundle = Extract<(typeof TOOL_METADATA)[number], { operations: unknown }>;
/** The keyed view shares the same operation declarations as registration and profiles. */
export const BUNDLE_TOOLS = Object.fromEntries(TOOL_METADATA.filter((tool) => 'operations' in tool).map((tool) => [tool.name, tool])) as {
    [Name in Bundle['name']]: Extract<Bundle, { name: Name }>;
};

/** Resolve selected/effective access and the complete table through one metadata path. */
export function resolveOperationAccess(name: string, input?: Record<string, unknown>) {
    const metadata = TOOL_METADATA.find((tool) => tool.name === name);
    if (!metadata) return undefined;
    if (!('operations' in metadata)) {
        return {
            operation: undefined,
            effectiveOperation: undefined,
            access: metadata.access,
            accesses: [metadata.access],
            destructive: 'destructive' in metadata && metadata.destructive === true,
            title: metadata.title,
        };
    }
    const operations: readonly Pick<Operation<never>, 'op' | 'access' | 'effectiveOp' | 'destructive'>[] = metadata.operations;
    const operation = typeof input?.[metadata.field] === 'string' ? input[metadata.field] as string : undefined;
    const entry = operations.find((entry) => entry.op === operation);
    const effectiveOperation = entry?.effectiveOp?.(input ?? {}) ?? operation;
    return {
        operation,
        effectiveOperation,
        access: operations.find((entry) => entry.op === effectiveOperation)?.access,
        // Full tables deliberately keep hints independent of the caller's profile.
        accesses: operations.map(({ access }) => access),
        destructive: operations.some(({ destructive }) => destructive),
        title: metadata.title,
    };
}
