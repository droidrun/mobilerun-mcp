import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { asErrorResult, asTextResult } from '../text-result.js';
import { disallowedFieldError, requireValue } from './op-helpers.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
/** One declaration supplies an operation's surface, dispatch and profile classification. */
export type Operation<Input, Result = unknown> = {
    op: string;
    input: z.ZodRawShape;
    required?: readonly string[];
    access: 'read' | 'write' | 'commerce';
    /** Assistant writes retain their existing full-profile gate. */
    fullOnly?: boolean;
    doc: string;
    run: (ctx: ToolCtx, input: Input) => Promise<Result>;
};
type SurfaceOperation = Pick<
    Operation<never>,
    'op' | 'input' | 'access' | 'fullOnly' | 'doc'
>;
export function operationValues<T extends SurfaceOperation>(table: readonly T[]): [T['op'], ...T['op'][]] {
    if (table.length === 0) throw new Error('An operation table must not be empty');
    return table.map(({ op }) => op) as [T['op'], ...T['op'][]];
}
/** Contextually type each custom handler from its own Zod fields. */
export function operation<const Op extends string, Shape extends z.ZodRawShape, Result>(
    entry: Omit<Operation<z.infer<z.ZodObject<Shape>> & { operation: Op }, Result>, 'op' | 'input'> & {
        op: Op;
        input: Shape;
    },
) {
    return entry;
}
type Intersection<U> = (U extends unknown ? (value: U) => void : never) extends (value: infer I) => void ? I : never;
type MergedShape<Table extends readonly SurfaceOperation[], Shared extends z.ZodRawShape> =
    Omit<Intersection<Table[number]['input']>, keyof Shared> & Shared;

/** Merge per-operation fields; shared overrides retain flat union constraints. */
export function operationInput<Table extends readonly SurfaceOperation[], Shared extends z.ZodRawShape>(
    table: Table,
    shared: Shared,
): MergedShape<Table, Shared> {
    const merged = Object.assign({}, ...table.map(({ input }) => input), shared);
    // Stable field traversal keeps JSON Schema reference anchors independent of dispatch order.
    return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) as MergedShape<Table, Shared>;
}
export function operationDescription(table: readonly SurfaceOperation[]): string {
    return table.map(({ op, doc }) => `${op}: ${doc}`).join(' ');
}
/** Per-operation fields and the deduplicated union, both in table order. */
export function operationFields<T extends SurfaceOperation>(table: readonly T[]) {
    const byOperation = Object.fromEntries(table.map(({ op, input }) => [op, Object.keys(input)])) as Record<T['op'], readonly string[]>;
    return { byOperation, keys: [...new Set(Object.values<readonly string[]>(byOperation).flat())] };
}
export async function runOperation<Table extends readonly (SurfaceOperation & { run: (ctx: ToolCtx, input: never) => Promise<unknown> })[]>(
    table: Table,
    op: string,
    ctx: ToolCtx,
    input: object,
): Promise<Awaited<ReturnType<Table[number]['run']>>> {
    const entry = table.find((entry) => entry.op === op);
    if (!entry) throw new Error(`Unknown operation: ${op}`);
    return await entry.run(ctx, { ...input, operation: op } as never) as Awaited<ReturnType<Table[number]['run']>>;
}

type SdkMetadata = Pick<Operation<never>, 'doc' | 'required'>;

/** Pure SDK passthrough, with an optional device path argument and stripped body. */
export function sdkOp<const Op extends string, S extends z.ZodRawShape, Device extends z.ZodType<string | undefined> | undefined = undefined>(
    op: Op,
    schema: z.ZodObject<S>,
    call: (ctx: ToolCtx, params: z.infer<z.ZodObject<S>>, deviceId: Device extends undefined ? undefined : string) => Promise<unknown>,
    access: Operation<never>['access'],
    metadata: SdkMetadata & { deviceId?: Device },
): Operation<Record<string, unknown>, CallToolResult> & { op: Op } {
    const { deviceId, ...details } = metadata;
    const input: z.ZodRawShape = { ...schema.partial().shape };
    if (deviceId) input.deviceId = deviceId;
    return {
        op, input, access, ...details,
        run: async (ctx, raw) => {
            // Check the path argument before parsing the body, as device adapters do.
            const id = deviceId ? requireValue(raw.deviceId as string | undefined, 'deviceId', op) : undefined;
            const params = schema.strip().parse(raw);
            return asTextResult(await call(ctx, params, id as Device extends undefined ? undefined : string));
        },
    };
}

type BundleTable = readonly Operation<never, CallToolResult>[];
type BundleOptions = {
    intro: string;
    shared?: z.ZodRawShape;
    field?: string;
    checkFields?: boolean;
    beforeRun?: (input: Record<string, unknown>) => string | null;
    onError?: (error: unknown, input: Record<string, unknown>) => never;
};

/** Register the complete enum once; enforcePolicy supplies the profile's dispatch gate. */
export function registerBundle(server: McpServer, ctx: ToolCtx, name: string, table: BundleTable, opts: BundleOptions): void {
    const all = operationValues(table);
    const values = narrowedValues(all, ctx.policy.operationAllowlist?.get(name));
    const field = opts.field ?? 'operation';
    const fields = operationInput(table, opts.shared ?? {});
    const { byOperation: allowed, keys: fieldKeys } = operationFields(table);
    const common = Object.keys(fields).filter((key) => !fields[key]!.isOptional());
    const keys = fieldKeys.filter((key) => !common.includes(key));
    server.registerTool(name, {
        description: opts.intro + ' ' + operationDescription(table) + allowedValuesNote(values, all),
        // Keep the FULL enum: policy denials must reach enforcePolicy, before any backend call.
        inputSchema: { [field]: z.enum(all), ...fields },
    }, async (input) => {
        const op = input[field] as string;
        const error = opts.checkFields
            ? disallowedFieldError(op, allowed[op]!.filter((key) => !common.includes(key)), keys, input)
            : opts.beforeRun?.(input);
        if (error) return asErrorResult(error);
        try {
            return await runOperation(table, op, ctx, input);
        } catch (error) {
            if (opts.onError) return opts.onError(error, input);
            throw error;
        }
    });
}
