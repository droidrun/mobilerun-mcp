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

/** Static registration metadata: bundles own operation access; standalone tools own one access value. */
export const TOOL_METADATA = [
    { name: 'numbers', field: 'operation', operations: NUMBERS_TABLE },
    { name: 'mailboxes', field: 'operation', operations: MAILBOXES_TABLE },
    { name: 'messages', field: 'operation', operations: MESSAGES_TABLE },
    { name: 'files', field: 'operation', operations: FILES_TABLE },
    { name: 'list_devices', access: 'read' },
    { name: 'get_device', access: 'read' },
    { name: 'get_device_screenshot', access: 'read' },
    { name: 'get_device_ui_state', access: 'read' },
    { name: 'list_apps_on_device', access: 'read' },
    { name: 'create_device', access: 'commerce' },
    { name: 'terminate_device', access: 'commerce' },
    { name: 'list_workflow_resources', field: 'resource', operations: LIST_WORKFLOW_RESOURCES_TABLE },
    { name: 'get_workflow_resource', field: 'resource', operations: GET_WORKFLOW_RESOURCE_TABLE },
    { name: 'create_action', access: 'write' },
    { name: 'create_trigger', access: 'write' },
    { name: 'create_flow', access: 'write' },
    { name: 'manage_flow', field: 'operation', operations: MANAGE_FLOW_TABLE },
    { name: 'workflow_events', field: 'operation', operations: WORKFLOW_EVENTS_TABLE },
    { name: 'webhooks', field: 'operation', operations: WEBHOOK_TABLE },
    { name: 'assistant', field: 'operation', operations: ASSISTANT_TABLE },
    { name: 'list_credentials', access: 'read' },
    { name: 'list_credential_packages', access: 'read' },
    { name: 'run_task', access: 'write' },
    { name: 'get_task', field: 'view', operations: GET_TASK_TABLE },
    { name: 'list_tasks', access: 'read' },
    { name: 'stop_task', access: 'write' },
    { name: 'send_task_message', access: 'write' },
    { name: 'get_task_media', field: 'kind', operations: GET_TASK_MEDIA_TABLE },
    { name: 'manage_device', field: 'operation', operations: MANAGE_DEVICE_TABLE },
    { name: 'device_action', field: 'operation', operations: DEVICE_ACTION_TABLE },
    { name: 'manage_device_apps', field: 'operation', operations: MANAGE_APPS_TABLE },
    { name: 'manage_device_files', field: 'operation', operations: MANAGE_FILES_TABLE },
    { name: 'configure_device', field: 'operation', operations: CONFIGURE_DEVICE_TABLE },
    { name: 'manage_esim', field: 'operation', operations: MANAGE_ESIM_TABLE },
    { name: 'apps', field: 'operation', operations: APPS_TABLE },
    { name: 'manage_credentials', field: 'operation', operations: MANAGE_CREDENTIALS_TABLE },
    { name: 'proxies', field: 'operation', operations: PROXIES_TABLE },
    { name: 'connect', field: 'operation', operations: CONNECT_TABLE },
    { name: 'platform_catalog', field: 'catalog', operations: PLATFORM_CATALOG_TABLE },
] as const;

type Bundle = Extract<(typeof TOOL_METADATA)[number], { operations: unknown }>;
/** The keyed view shares the same operation declarations as registration and profiles. */
export const BUNDLE_TOOLS = Object.fromEntries(TOOL_METADATA.filter((tool) => 'operations' in tool).map((tool) => [tool.name, tool])) as {
    [Name in Bundle['name']]: Extract<Bundle, { name: Name }>;
};
