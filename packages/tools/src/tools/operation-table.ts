import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toJsonSchemaCompat } from '@modelcontextprotocol/sdk/server/zod-json-schema-compat.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asErrorResult, asTextResult } from '../text-result.js';
/** One declaration supplies an operation's surface, dispatch and profile classification. */
export type Operation<Input> = {
    op: string;
    input: z.ZodRawShape;
    access: 'read' | 'write' | 'commerce' | 'full';
    /** A payload may require another operation's access in addition to its declared operation. */
    effectiveOp?: (input: Record<string, unknown>) => string;
    doc: string;
    run: (ctx: ToolCtx, input: Input) => Promise<CallToolResult>;
};
type SurfaceOperation = Pick<Operation<never>, 'op' | 'input' | 'access' | 'doc'>;
function operationValues<T extends SurfaceOperation>(table: readonly T[]): [T['op'], ...T['op'][]] {
    if (table.length === 0) throw new Error('An operation table must not be empty');
    return table.map(({ op }) => op) as [T['op'], ...T['op'][]];
}
/** Contextually type each custom handler from its own Zod fields. */
export function operation<const Op extends string, Shape extends z.ZodRawShape>(
    entry: Omit<Operation<z.infer<z.ZodObject<Shape>> & { operation: Op }>, 'op' | 'input'> & {
        op: Op;
        input: Shape;
    },
) {
    return entry;
}
/** Merge per-operation fields; shared overrides retain flat union constraints. */
function operationInput(table: readonly SurfaceOperation[], shared: z.ZodRawShape = {}): z.ZodRawShape {
    const definitions = new Map<string, string>();
    for (const { op, input } of table) {
        for (const [key, field] of Object.entries(input)) {
            if (Object.hasOwn(shared, key)) continue;
            let schema = field;
            while (schema instanceof z.ZodOptional) schema = schema.unwrap();
            const definition = JSON.stringify(toJsonSchemaCompat(z.object({ value: schema })), function (key, value: unknown) {
                if (key === 'description' && typeof value === 'string') return undefined;
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
                }
                return value;
            });
            const previous = definitions.get(key);
            if (previous !== undefined && previous !== definition) {
                throw new Error(`Conflicting definitions for field "${key}" in operation=${op}; declare a shared field explicitly`);
            }
            definitions.set(key, definition);
        }
    }
    const merged: z.ZodRawShape = Object.assign({}, ...table.map(({ input }) => input), shared);
    // Stable field traversal keeps JSON Schema reference anchors independent of dispatch order.
    return Object.fromEntries(Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}
function operationDescription(table: readonly SurfaceOperation[]): string {
    return table.map(({ op, doc }) => `${op}: ${doc}`).join(' ');
}
/** Per-operation fields and the deduplicated union, both in table order. */
export function operationFields<T extends SurfaceOperation>(table: readonly T[]) {
    const byOperation = Object.fromEntries(table.map(({ op, input }) => [op, Object.keys(input)])) as unknown as Record<
        T['op'],
        readonly string[]
    >;
    return { byOperation, keys: [...new Set(Object.values<readonly string[]>(byOperation).flat())] };
}
async function runOperation(table: BundleTable, op: string, ctx: ToolCtx, input: object): Promise<CallToolResult> {
    const entry = table.find((entry) => entry.op === op);
    if (!entry) throw new Error(`Unknown operation: ${op}`);
    // The selected entry validates its own fields; normalize resource/view/kind selectors for typed handlers.
    return entry.run(ctx, { ...input, operation: op } as never);
}

type SdkMetadata = Pick<Operation<never>, 'doc' | 'effectiveOp'>;

/** SDK passthrough with a stripped body, optional device path and custom result formatting. */
export function sdkOp<
    const Op extends string,
    Value,
    S extends z.ZodRawShape,
    Device extends z.ZodType<string | undefined> | undefined = undefined,
>(
    op: Op,
    schema: z.ZodObject<S>,
    call: (ctx: ToolCtx, params: z.infer<z.ZodObject<S>>, deviceId: Device extends undefined ? undefined : string) => Promise<Value>,
    access: Operation<never>['access'],
    metadata: SdkMetadata & { deviceId?: Device; result?: (ctx: ToolCtx, value: Value) => CallToolResult | Promise<CallToolResult> },
): Operation<Record<string, unknown>> & { op: Op } {
    const { deviceId, result, ...details } = metadata;
    const input: z.ZodRawShape = { ...schema.partial().shape };
    if (deviceId) input.deviceId = deviceId;
    return {
        op,
        input,
        access,
        ...details,
        run: async (ctx, raw) => {
            // Check the path argument before parsing the body, as device adapters do.
            const id = deviceId ? requireValue(raw.deviceId as string | undefined, 'deviceId', op) : undefined;
            const params = schema.strip().parse(raw);
            const value = await call(ctx, params, id as Device extends undefined ? undefined : string);
            return result ? result(ctx, value) : asTextResult(value);
        },
    };
}

type BundleTable = readonly Operation<never>[];
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
    server.registerTool(
        name,
        {
            description: opts.intro + ' ' + operationDescription(table) + allowedValuesNote(values, all),
            // Keep the FULL enum: policy denials must reach enforcePolicy, before any backend call.
            inputSchema: { [field]: z.enum(all), ...fields },
        },
        async (input) => {
            const op = input[field] as string;
            const error = opts.checkFields
                ? disallowedFieldError(
                      op,
                      allowed[op]!.filter((key) => !common.includes(key)),
                      keys,
                      input,
                  )
                : null;
            const validationError = error ?? opts.beforeRun?.(input);
            if (validationError) return asErrorResult(validationError);
            try {
                return await runOperation(table, op, ctx, input);
            } catch (error) {
                if (opts.onError) return opts.onError(error, input);
                throw error;
            }
        },
    );
}

/** Shared operation validation; optional tool prefixes preserve existing error text. */
export function requireValue<T>(value: T | undefined, name: string, operation: string, tool = ''): T {
    if (value === undefined) throw new Error((tool ? tool + ' ' : '') + `operation=${operation} requires ${name}`);
    return value;
}

function disallowedFieldError(
    operation: string,
    allowed: readonly string[],
    allKeys: readonly string[],
    input: Record<string, unknown>,
): string | null {
    const extra = allKeys.filter((k) => input[k] !== undefined && !allowed.includes(k));
    if (extra.length === 0) return null;
    return `field ${extra.join(', ')} is not valid for operation=${operation}; allowed fields: ${allowed.join(', ') || '(none)'}`;
}

export function disallowedFilterError(
    resource: string,
    allowed: readonly string[],
    allKeys: readonly string[],
    filters: object,
): string | null {
    const input = filters as Record<string, unknown>;
    const extra = allKeys.filter((k) => input[k] !== undefined && !allowed.includes(k));
    if (extra.length > 0) {
        return `filter ${extra.join(', ')} is not valid for resource=${resource}; allowed filters: ${allowed.join(', ') || '(none)'}`;
    }
    return null;
}

// Advertise the permitted subset while retaining the full enum for dispatch-time policy errors.
function narrowedValues<T extends string>(all: readonly T[], allowed: ReadonlySet<string> | undefined): readonly T[] {
    if (!allowed) return all;
    const filtered = all.filter((v) => allowed.has(v));
    // An allowlist entry that matches nothing in `all` is almost certainly a
    // host misconfiguration (e.g. a typo'd operation name) — fail open to the
    // full set here rather than advertising zero options; the dispatch-time
    // check still enforces the (empty, therefore always-denying) allowlist.
    return filtered.length > 0 ? filtered : all;
}

function allowedValuesNote(narrowed: readonly string[], all: readonly string[]): string {
    if (narrowed.length === all.length) return '';
    return ` Available for this credential: ${narrowed.join(', ')}.`;
}

/** Conservative hints derived from the same access classifications as profiles. */
export function operationAnnotations(operations: readonly { access: Operation<never>['access'] }[]) {
    const readOnly = operations.every(({ access }) => access === 'read');
    return {
        readOnlyHint: readOnly,
        destructiveHint: !readOnly,
        idempotentHint: readOnly,
        // Writes and full access may send data externally; commerce starts billed services.
        openWorldHint: !readOnly,
    };
}
