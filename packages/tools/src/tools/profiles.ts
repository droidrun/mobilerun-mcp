// `profiles` bundle tool: /profiles CRUD + PUT
// /devices/{id}/profile (apply). All 6
// operations exist 1:1 on @mobilerun/sdk 5.1.0's `client.profiles.*` /
// `client.devices.profile.update`.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asErrorResult, asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

const PROFILE_OPERATIONS = ['list', 'get', 'create', 'update', 'delete', 'apply'] as const;
type ProfileOperation = (typeof PROFILE_OPERATIONS)[number];

const PROFILE_FIELDS: Record<ProfileOperation, readonly string[]> = {
    list: ['name', 'orderBy', 'orderByDirection', 'page', 'pageSize'],
    get: ['profileId'],
    create: ['name', 'spec'],
    update: ['profileId', 'name', 'spec'],
    delete: ['profileId'],
    apply: ['deviceId', 'profileId'],
};
const PROFILE_FIELD_KEYS = ['name', 'orderBy', 'orderByDirection', 'page', 'pageSize', 'profileId', 'spec', 'deviceId'] as const;

function requireValue<T>(value: T | undefined, name: string, operation: string): T {
    if (value === undefined) throw new Error(`profiles operation=${operation} requires ${name}`);
    return value;
}

function disallowedFieldError(operation: ProfileOperation, input: Record<string, unknown>): string | null {
    const allowed = PROFILE_FIELDS[operation];
    const extra = PROFILE_FIELD_KEYS.filter((k) => input[k] !== undefined && !allowed.includes(k));
    if (extra.length === 0) return null;
    return `field ${extra.join(', ')} is not valid for operation=${operation}; allowed fields: ${allowed.join(', ') || '(none)'}`;
}

// Loose passthrough for Shared.DeviceSpec — same rationale as
// ../backend/profiles.ts's DeviceSpecInput: this tool surfaces the shape a
// caller sends, not a field-by-field mirror of every nested device-spec
// property.
const deviceSpecSchema = z
    .object({
        androidVersion: z.number().int().optional(),
        apps: z.array(z.string()).nullable().optional(),
        country: z.string().optional(),
        files: z.array(z.string()).nullable().optional(),
        locale: z.string().optional(),
        location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
        name: z.string().optional(),
        timezone: z.string().optional(),
        carrier: z.record(z.string(), z.unknown()).optional(),
        identifiers: z.record(z.string(), z.unknown()).optional(),
        proxy: z
            .object({
                name: z.string().optional(),
                smartIp: z.boolean().optional(),
                socks5: z.object({ host: z.string(), port: z.number().int(), user: z.string().optional(), password: z.string().optional() }).optional(),
            })
            .optional(),
    })
    .describe('Device specification, per @mobilerun/sdk Shared.DeviceSpec.');

export function registerProfileTools(server: McpServer, ctx: ToolCtx): void {
    const values = narrowedValues(PROFILE_OPERATIONS, ctx.policy.operationAllowlist?.get('profiles'));

    server.registerTool(
        'profiles',
        {
            description:
                'Manage reusable device profiles (a named device spec) and apply one to an existing device. Operations: list (name?, orderBy?, orderByDirection?, page?, pageSize?), get (profileId), create (name, spec), update (profileId, name, spec — full replace), delete (profileId), apply (deviceId, profileId — PUTs the profile spec onto an already-provisioned device).' +
                allowedValuesNote(values, PROFILE_OPERATIONS),
            inputSchema: {
                operation: z.enum(PROFILE_OPERATIONS),
                profileId: z.string().optional(),
                deviceId: z.string().optional(),
                name: z.string().optional(),
                spec: deviceSpecSchema.optional(),
                orderBy: z.enum(['name', 'created_at', 'updated_at']).optional(),
                orderByDirection: z.enum(['asc', 'desc']).optional(),
                page: z.number().int().positive().optional(),
                pageSize: z.number().int().positive().max(100).optional(),
            },
        },
        async (input: { operation: ProfileOperation } & Record<string, unknown>) => {
            const { operation } = input;
            const fieldError = disallowedFieldError(operation, input);
            if (fieldError) return asErrorResult(fieldError);

            const backend = ctx.backend.profiles;

            if (operation === 'list') {
                return asTextResult(
                    await backend.listProfiles({
                        name: input.name as string | undefined,
                        orderBy: input.orderBy as 'name' | 'created_at' | 'updated_at' | undefined,
                        orderByDirection: input.orderByDirection as 'asc' | 'desc' | undefined,
                        page: input.page as number | undefined,
                        pageSize: input.pageSize as number | undefined,
                    }),
                );
            }
            if (operation === 'create') {
                return asTextResult(
                    await backend.createProfile(
                        requireValue(input.name as string | undefined, 'name', operation),
                        requireValue(input.spec as object | undefined, 'spec', operation),
                    ),
                );
            }
            if (operation === 'apply') {
                return asTextResult(
                    await backend.applyProfile(
                        requireValue(input.deviceId as string | undefined, 'deviceId', operation),
                        requireValue(input.profileId as string | undefined, 'profileId', operation),
                    ),
                );
            }

            const profileId = requireValue(input.profileId as string | undefined, 'profileId', operation);
            if (operation === 'get') return asTextResult(await backend.getProfile(profileId));
            if (operation === 'update') {
                return asTextResult(
                    await backend.updateProfile(
                        profileId,
                        requireValue(input.name as string | undefined, 'name', operation),
                        requireValue(input.spec as object | undefined, 'spec', operation),
                    ),
                );
            }
            return asTextResult(await backend.deleteProfile(profileId));
        },
    );
}
