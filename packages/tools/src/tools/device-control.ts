import { MANAGE_DEVICE_SHARED_FIELDS, MANAGE_DEVICE_TABLE } from './manage-device-operations.js';
import { DEVICE_ACTION_SHARED_FIELDS, DEVICE_ACTION_TABLE } from './device-action-operations.js';
import { MANAGE_APPS_SHARED_FIELDS, MANAGE_APPS_TABLE } from './manage-device-apps-operations.js';
import { MANAGE_FILES_SHARED_FIELDS, MANAGE_FILES_TABLE } from './manage-device-files-operations.js';
import { CONFIGURE_DEVICE_SHARED_FIELDS, CONFIGURE_DEVICE_TABLE } from './configure-device-operations.js';
import { MANAGE_ESIM_SHARED_FIELDS, MANAGE_ESIM_TABLE } from './manage-esim-operations.js';
import {
    operationValues,
    operationInput,
    operationDescription,
    runOperation,
    operationFields,
} from './operation-table.js';

import { disallowedFieldError } from './op-helpers.js';
// Device-control bundle tools, including device media and connectivity operations.

import { type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { type ToolCtx } from '../ctx.js';
import { asErrorResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

// ---------------------------------------------------------------------------
// manage_device
// ---------------------------------------------------------------------------

const MANAGE_DEVICE_OPERATIONS = operationValues(MANAGE_DEVICE_TABLE);
type ManageDeviceOperation = (typeof MANAGE_DEVICE_OPERATIONS)[number];
const MANAGE_DEVICE_FIELDS = operationFields(MANAGE_DEVICE_TABLE);
const MANAGE_DEVICE_FIELD_KEYS = [...new Set(Object.values(MANAGE_DEVICE_FIELDS).flat())];
function registerManageDevice(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_DEVICE_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device'));
    server.registerTool(
        'manage_device',
        {
            description:
                operationDescription(MANAGE_DEVICE_TABLE) + allowedValuesNote(values, MANAGE_DEVICE_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_DEVICE_OPERATIONS),
                ...operationInput(MANAGE_DEVICE_TABLE, MANAGE_DEVICE_SHARED_FIELDS),
            },
        },
        async (input: { operation: ManageDeviceOperation; deviceId?: string; name?: string }) => {
            const fieldError = disallowedFieldError(
                input.operation,
                MANAGE_DEVICE_FIELDS[input.operation],
                MANAGE_DEVICE_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);
            return runOperation(MANAGE_DEVICE_TABLE, input.operation, ctx, input);
        },
    );
}
// ---------------------------------------------------------------------------
// device_action
// ---------------------------------------------------------------------------
const DEVICE_ACTION_OPERATIONS = operationValues(DEVICE_ACTION_TABLE);
type DeviceActionOperation = (typeof DEVICE_ACTION_OPERATIONS)[number];
const DEVICE_ACTION_FIELDS = operationFields(DEVICE_ACTION_TABLE);
const DEVICE_ACTION_FIELD_KEYS = [...new Set(Object.values(DEVICE_ACTION_FIELDS).flat())];
function registerDeviceAction(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(DEVICE_ACTION_OPERATIONS, ctx.policy.operationAllowlist?.get('device_action'));
    server.registerTool(
        'device_action',
        {
            description:
                operationDescription(DEVICE_ACTION_TABLE) + allowedValuesNote(values, DEVICE_ACTION_OPERATIONS),
            inputSchema: {
                operation: z.enum(DEVICE_ACTION_OPERATIONS),
                ...operationInput(
                    DEVICE_ACTION_TABLE,
                    DEVICE_ACTION_SHARED_FIELDS,
                ),
            },
        },
        async (
            input: {
                operation: DeviceActionOperation;
                deviceId: string;
                displayId?: number;
            } & Record<string, unknown>,
        ) => {
            const fieldError = disallowedFieldError(
                input.operation,
                DEVICE_ACTION_FIELDS[input.operation],
                DEVICE_ACTION_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);
            return runOperation(DEVICE_ACTION_TABLE, input.operation, ctx, input);
        },
    );
}
// ---------------------------------------------------------------------------
// manage_device_apps
// ---------------------------------------------------------------------------
const MANAGE_APPS_OPERATIONS = operationValues(MANAGE_APPS_TABLE);
type ManageAppsOperation = (typeof MANAGE_APPS_OPERATIONS)[number];
const MANAGE_APPS_FIELDS = operationFields(MANAGE_APPS_TABLE);
const MANAGE_APPS_FIELD_KEYS = [...new Set(Object.values(MANAGE_APPS_FIELDS).flat())];
function registerManageDeviceApps(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_APPS_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device_apps'));
    server.registerTool(
        'manage_device_apps',
        {
            description: operationDescription(MANAGE_APPS_TABLE) + allowedValuesNote(values, MANAGE_APPS_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_APPS_OPERATIONS),
                ...operationInput(
                    MANAGE_APPS_TABLE,
                    MANAGE_APPS_SHARED_FIELDS,
                ),
            },
        },
        async (
            input: {
                operation: ManageAppsOperation;
                deviceId: string;
            } & Record<string, unknown>,
        ) => {
            const fieldError = disallowedFieldError(
                input.operation,
                MANAGE_APPS_FIELDS[input.operation],
                MANAGE_APPS_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);
            return runOperation(MANAGE_APPS_TABLE, input.operation, ctx, input);
        },
    );
}
// ---------------------------------------------------------------------------
// manage_device_files
// ---------------------------------------------------------------------------
const MANAGE_FILES_OPERATIONS = operationValues(MANAGE_FILES_TABLE);
type ManageFilesOperation = (typeof MANAGE_FILES_OPERATIONS)[number];
const MANAGE_FILES_FIELDS = operationFields(MANAGE_FILES_TABLE);
const MANAGE_FILES_FIELD_KEYS = [...new Set(Object.values(MANAGE_FILES_FIELDS).flat())];
function registerManageDeviceFiles(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_FILES_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_device_files'));
    server.registerTool(
        'manage_device_files',
        {
            description: operationDescription(MANAGE_FILES_TABLE) + allowedValuesNote(values, MANAGE_FILES_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_FILES_OPERATIONS),
                ...operationInput(
                    MANAGE_FILES_TABLE,
                    MANAGE_FILES_SHARED_FIELDS,
                ),
            },
        },
        async (
            input: {
                operation: ManageFilesOperation;
                deviceId: string;
                path: string;
            } & Record<string, unknown>,
        ) => {
            const { operation, deviceId, path } = input;
            const fieldError = disallowedFieldError(
                operation,
                MANAGE_FILES_FIELDS[operation],
                MANAGE_FILES_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);
            return runOperation(MANAGE_FILES_TABLE, input.operation, ctx, input);
        },
    );
}
// ---------------------------------------------------------------------------
// configure_device
// ---------------------------------------------------------------------------
const CONFIGURE_DEVICE_OPERATIONS = operationValues(CONFIGURE_DEVICE_TABLE);
type ConfigureDeviceOperation = (typeof CONFIGURE_DEVICE_OPERATIONS)[number];
const CONFIGURE_DEVICE_FIELDS = operationFields(CONFIGURE_DEVICE_TABLE);
const CONFIGURE_DEVICE_FIELD_KEYS = [...new Set(Object.values(CONFIGURE_DEVICE_FIELDS).flat())];
function registerConfigureDevice(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(CONFIGURE_DEVICE_OPERATIONS, ctx.policy.operationAllowlist?.get('configure_device'));
    server.registerTool(
        'configure_device',
        {
            description:
                operationDescription(CONFIGURE_DEVICE_TABLE) + allowedValuesNote(values, CONFIGURE_DEVICE_OPERATIONS),
            inputSchema: {
                operation: z.enum(CONFIGURE_DEVICE_OPERATIONS),
                ...operationInput(
                    CONFIGURE_DEVICE_TABLE,
                    CONFIGURE_DEVICE_SHARED_FIELDS,
                ),
            },
        },
        async (
            input: {
                operation: ConfigureDeviceOperation;
                deviceId: string;
            } & Record<string, unknown>,
        ) => {
            const fieldError = disallowedFieldError(
                input.operation,
                CONFIGURE_DEVICE_FIELDS[input.operation],
                CONFIGURE_DEVICE_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);
            return runOperation(CONFIGURE_DEVICE_TABLE, input.operation, ctx, input);
        },
    );
}
// ---------------------------------------------------------------------------
// manage_esim
// ---------------------------------------------------------------------------
const MANAGE_ESIM_OPERATIONS = operationValues(MANAGE_ESIM_TABLE);
type ManageEsimOperation = (typeof MANAGE_ESIM_OPERATIONS)[number];
const MANAGE_ESIM_FIELDS = operationFields(MANAGE_ESIM_TABLE);
const MANAGE_ESIM_FIELD_KEYS = [...new Set(Object.values(MANAGE_ESIM_FIELDS).flat())];
function registerManageEsim(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(MANAGE_ESIM_OPERATIONS, ctx.policy.operationAllowlist?.get('manage_esim'));
    server.registerTool(
        'manage_esim',
        {
            description: operationDescription(MANAGE_ESIM_TABLE) + allowedValuesNote(values, MANAGE_ESIM_OPERATIONS),
            inputSchema: {
                operation: z.enum(MANAGE_ESIM_OPERATIONS),
                ...operationInput(
                    MANAGE_ESIM_TABLE,
                    MANAGE_ESIM_SHARED_FIELDS,
                ),
            },
        },
        async (
            input: {
                operation: ManageEsimOperation;
                deviceId: string;
            } & Record<string, unknown>,
        ) => {
            const fieldError = disallowedFieldError(
                input.operation,
                MANAGE_ESIM_FIELDS[input.operation],
                MANAGE_ESIM_FIELD_KEYS,
                input,
            );
            if (fieldError) return asErrorResult(fieldError);
            return runOperation(MANAGE_ESIM_TABLE, input.operation, ctx, input);
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
