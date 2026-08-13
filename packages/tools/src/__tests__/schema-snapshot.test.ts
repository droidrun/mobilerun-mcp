// Snapshots the full-access tool surface (names + input schema shapes) so
// an accidental rename/removal, a required-field/type change, or a dropped
// enum value shows up as a diff in review — not silently in prod. See
// CONTRACT.md for what counts as a breaking (major) vs additive (minor) vs
// cosmetic (patch) change here, and update the snapshot deliberately when a
// change is intentional (`bun test --update-snapshots`).
import { describe, expect, test } from 'bun:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer, fullAccessPolicy } from '../register.js';
import type { Backend } from '../backend/index.js';
import { createAuthContext } from '../ctx.js';

function noopBackend(): Backend {
    const notImplemented = () => Promise.reject(new Error('not implemented in schema-snapshot stub'));
    return {
        devices: {
            listDevices: notImplemented,
            getDevice: notImplemented,
            getDeviceScreenshot: notImplemented,
            getDeviceUiState: notImplemented,
            listAppsOnDevice: notImplemented,
            createDevice: notImplemented,
            terminateDevice: notImplemented,
        },
        workflows: {
            listActionCatalog: notImplemented,
            getActionCatalogEntry: notImplemented,
            listAppEventCatalog: notImplemented,
            listActions: notImplemented,
            getAction: notImplemented,
            createAction: notImplemented,
            listTriggers: notImplemented,
            getTrigger: notImplemented,
            createTrigger: notImplemented,
            listFlows: notImplemented,
            getFlow: notImplemented,
            createFlow: notImplemented,
            cloneFlow: notImplemented,
            unblockFlow: notImplemented,
            addFlowAction: notImplemented,
            removeFlowAction: notImplemented,
            replaceFlowActions: notImplemented,
            listExecutions: notImplemented,
            getExecution: notImplemented,
            getExecutionMetrics: notImplemented,
            listServices: notImplemented,
            listServiceMethods: notImplemented,
            ingestEvent: notImplemented,
            dryRunEvent: notImplemented,
            registerEventTypes: notImplemented,
        },
        webhooks: {
            createWebhook: notImplemented,
            listWebhooks: notImplemented,
            getWebhook: notImplemented,
            updateWebhook: notImplemented,
            rotateWebhookSecret: notImplemented,
            testWebhook: notImplemented,
            listWebhookDeliveries: notImplemented,
            getWebhookDelivery: notImplemented,
            getWebhookDeliveryStats: notImplemented,
            listWebhookEventTypes: notImplemented,
        },
        credentials: {
            listCredentials: notImplemented,
            listCredentialPackages: notImplemented,
            initPackage: notImplemented,
            createCredential: notImplemented,
            deleteCredential: notImplemented,
            addField: notImplemented,
            updateField: notImplemented,
            deleteField: notImplemented,
        },
        apps: {
            listApps: notImplemented,
            getApp: notImplemented,
            listAppVersions: notImplemented,
            createAppUploadUrl: notImplemented,
            confirmAppUpload: notImplemented,
            markAppUploadFailed: notImplemented,
            deleteApp: notImplemented,
        },
        proxies: {
            listProxies: notImplemented,
            getProxy: notImplemented,
            createProxy: notImplemented,
            updateProxy: notImplemented,
            deleteProxy: notImplemented,
            lookupProxy: notImplemented,
        },
        connect: {
            listCountries: notImplemented,
            listConnectProxies: notImplemented,
            getConnectProxy: notImplemented,
            buyConnectProxy: notImplemented,
            cancelConnectProxy: notImplemented,
            pingConnectProxy: notImplemented,
            listConnectProxyConnections: notImplemented,
            listConnectUsers: notImplemented,
            getConnectUser: notImplemented,
            listConnectUserConnections: notImplemented,
        },
        platformCatalog: {
            listModels: notImplemented,
            listTimezones: notImplemented,
        },
        tasks: {
            runTask: notImplemented,
            getTaskSummary: notImplemented,
            getTaskStatus: notImplemented,
            getTaskTrajectory: notImplemented,
            listTasks: notImplemented,
            stopTask: notImplemented,
            sendTaskMessage: notImplemented,
            getTaskMedia: notImplemented,
        },
        deviceControl: {
            rebootDevice: notImplemented,
            resetDevice: notImplemented,
            renameDevice: notImplemented,
            waitDeviceReady: notImplemented,
            getDeviceCapabilities: notImplemented,
            countDevices: notImplemented,
            tap: notImplemented,
            swipe: notImplemented,
            keyboardWrite: notImplemented,
            keyboardKey: notImplemented,
            keyboardClear: notImplemented,
            globalAction: notImplemented,
            installApp: notImplemented,
            deleteApp: notImplemented,
            startApp: notImplemented,
            stopApp: notImplemented,
            listPackages: notImplemented,
            listFiles: notImplemented,
            uploadFile: notImplemented,
            downloadFile: notImplemented,
            deleteFile: notImplemented,
            getLanguage: notImplemented,
            setLanguage: notImplemented,
            getTimezone: notImplemented,
            setTimezone: notImplemented,
            getLocation: notImplemented,
            setLocation: notImplemented,
            getTime: notImplemented,
            getOverlay: notImplemented,
            setOverlay: notImplemented,
            connectProxy: notImplemented,
            disconnectProxy: notImplemented,
            getProxyStatus: notImplemented,
            listEsims: notImplemented,
            activateEsim: notImplemented,
            enableEsim: notImplemented,
            removeEsim: notImplemented,
        },
    };
}

// Stably serialized: sorted tool list, each tool's own keys sorted so JSON
// key-order churn in the SDK's zod->JSON-Schema converter can't cause a
// false-positive diff independent of an actual shape change.
function stableSort(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stableSort);
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
        return Object.fromEntries(entries.map(([k, v]) => [k, stableSort(v)]));
    }
    return value;
}

describe('tool contract snapshot', () => {
    test('full-access tool surface (names + input schemas) matches the committed snapshot', async () => {
        const ctx = { backend: noopBackend(), auth: createAuthContext({ kind: 'api_key', subject: 'snapshot' }), policy: fullAccessPolicy() };
        const server = buildMcpServer(ctx);
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'schema-snapshot', version: '0.0.0' });
        await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

        const { tools } = await client.listTools();
        const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));
        const surface = sorted.map((t) => ({
            name: t.name,
            hasDescription: Boolean(t.description && t.description.length > 0),
            inputSchema: stableSort(t.inputSchema),
        }));

        expect(surface).toMatchSnapshot();
    });
});
