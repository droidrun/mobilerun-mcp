import { APPS_TABLE } from './apps.js';
import { ASSISTANT_TABLE } from './assistant.js';
import { CONNECT_TABLE } from './connect.js';
import { MANAGE_CREDENTIALS_TABLE } from './credentials.js';
import { MANAGE_DEVICE_TABLE } from './manage-device-operations.js';
import { DEVICE_ACTION_TABLE } from './device-action-operations.js';
import { MANAGE_APPS_TABLE } from './manage-device-apps-operations.js';
import { MANAGE_FILES_TABLE } from './manage-device-files-operations.js';
import { CONFIGURE_DEVICE_TABLE } from './configure-device-operations.js';
import { MANAGE_ESIM_TABLE } from './manage-esim-operations.js';
import { FILES_TABLE } from './files.js';
import { MAILBOXES_TABLE } from './mailboxes.js';
import { MANAGE_FLOW_TABLE } from './manage-flow.js';
import { MESSAGES_TABLE } from './messages.js';
import { NUMBERS_TABLE } from './numbers.js';
import { PLATFORM_CATALOG_TABLE } from './platform-catalog.js';
import { PROXIES_TABLE } from './proxies.js';
import { GET_TASK_TABLE, GET_TASK_MEDIA_TABLE } from './tasks.js';
import { WEBHOOK_TABLE } from './webhooks.js';
import { WORKFLOW_EVENTS_TABLE } from './workflow-events.js';
import { LIST_WORKFLOW_RESOURCES_TABLE, GET_WORKFLOW_RESOURCE_TABLE } from './workflows.js';

/** Bundle metadata used by policy construction and dispatch-time enforcement. */
export const BUNDLE_TOOLS = {
    files: { field: 'operation', operations: FILES_TABLE },
    messages: { field: 'operation', operations: MESSAGES_TABLE },
    mailboxes: { field: 'operation', operations: MAILBOXES_TABLE },
    numbers: { field: 'operation', operations: NUMBERS_TABLE },
    webhooks: { field: 'operation', operations: WEBHOOK_TABLE },
    assistant: { field: 'operation', operations: ASSISTANT_TABLE },
    list_workflow_resources: { field: 'resource', operations: LIST_WORKFLOW_RESOURCES_TABLE },
    get_workflow_resource: { field: 'resource', operations: GET_WORKFLOW_RESOURCE_TABLE },
    get_task: { field: 'view', operations: GET_TASK_TABLE },
    get_task_media: { field: 'kind', operations: GET_TASK_MEDIA_TABLE },
    manage_device: { field: 'operation', operations: MANAGE_DEVICE_TABLE },
    device_action: { field: 'operation', operations: DEVICE_ACTION_TABLE },
    manage_device_apps: { field: 'operation', operations: MANAGE_APPS_TABLE },
    manage_device_files: { field: 'operation', operations: MANAGE_FILES_TABLE },
    configure_device: { field: 'operation', operations: CONFIGURE_DEVICE_TABLE },
    manage_esim: { field: 'operation', operations: MANAGE_ESIM_TABLE },
    manage_flow: { field: 'operation', operations: MANAGE_FLOW_TABLE },
    workflow_events: { field: 'operation', operations: WORKFLOW_EVENTS_TABLE },
    apps: { field: 'operation', operations: APPS_TABLE },
    manage_credentials: { field: 'operation', operations: MANAGE_CREDENTIALS_TABLE },
    proxies: { field: 'operation', operations: PROXIES_TABLE },
    connect: { field: 'operation', operations: CONNECT_TABLE },
    platform_catalog: { field: 'catalog', operations: PLATFORM_CATALOG_TABLE },
} as const;
