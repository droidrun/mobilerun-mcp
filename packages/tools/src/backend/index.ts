import type { FilesBackend } from './files.js';
import type { MessagesBackend } from './messages.js';
import type { MailboxesBackend } from './mailboxes.js';
import type { NumbersBackend } from './numbers.js';
// Composes the domain ports into the Backend type consumed by ToolCtx.
import type { DevicesBackend } from './devices.js';
import type { WorkflowsBackend } from './workflows.js';
import type { WebhooksBackend } from './webhooks.js';
import type { AssistantBackend } from './assistant.js';
import type { CredentialsBackend } from './credentials.js';
import type { TasksBackend } from './tasks.js';
import type { DeviceControlBackend } from './device-control.js';
import type { AppsBackend } from './apps.js';
import type { ProxiesBackend } from './proxies.js';
import type { ConnectBackend } from './connect.js';
import type { PlatformCatalogBackend } from './platform-catalog.js';

export type Backend = {
    files: FilesBackend;
    messages: MessagesBackend;
    mailboxes: MailboxesBackend;
    numbers: NumbersBackend;
    devices: DevicesBackend;
    workflows: WorkflowsBackend;
    webhooks: WebhooksBackend;
    assistant: AssistantBackend;
    credentials: CredentialsBackend;
    tasks: TasksBackend;
    deviceControl: DeviceControlBackend;
    apps: AppsBackend;
    proxies: ProxiesBackend;
    connect: ConnectBackend;
    platformCatalog: PlatformCatalogBackend;
};
