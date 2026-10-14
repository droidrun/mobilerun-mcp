import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
/** One declaration supplies an operation's surface, dispatch and profile classification. */
export type Operation<Input, Result = unknown> = {
    op: string;
    input: z.ZodRawShape;
    required?: readonly string[];
    /** Retains the established order of fields in validation errors. */
    fieldOrder?: number;
    /** Preserve repeated legacy allowlist entries in validation error text. */
    fieldRepeats?: readonly string[];
    readonly: boolean;
    billed: boolean;
    /** Ordered fragments preserve existing prose even when enum and prose orders differ. */
    describe: {
        order: number;
        text: string;
    };
    run: (ctx: ToolCtx, input: Input) => Promise<Result>;
};
type SurfaceOperation = Pick<
    Operation<never>,
    'op' | 'input' | 'readonly' | 'billed' | 'describe' | 'fieldOrder' | 'fieldRepeats'
>;
export function operationValues<T extends SurfaceOperation>(table: readonly T[]): [T['op'], ...T['op'][]] {
    if (table.length === 0) throw new Error('An operation table must not be empty');
    return table.map(({ op }) => op) as [T['op'], ...T['op'][]];
}
/** Select flat fields without changing their optionality, constraints or descriptions. */
export function selectInput<Shape extends z.ZodRawShape>(fields: Shape, keys: readonly string[]): z.ZodRawShape {
    return Object.fromEntries(
        keys.map((key) => {
            if (!fields[key]) throw new Error(`Missing surface field: ${key}`);
            return [key, fields[key]];
        }),
    );
}
export function operationInput<Shape extends z.ZodRawShape>(
    table: readonly SurfaceOperation[],
    fields: Shape,
    common: z.ZodRawShape = {},
): Shape {
    const merged = Object.assign({}, ...table.map(({ input }) => input), common);
    // Zod's JSON Schema references depend on traversal order, so retain the original field order.
    return Object.fromEntries(
        Object.keys(fields).map((key) => {
            if (!merged[key]) throw new Error(`Unassigned surface field: ${key}`);
            return [key, merged[key]];
        }),
    ) as Shape;
}
export function operationDescription(table: readonly SurfaceOperation[]): string {
    return [...table]
        .sort((a, b) => a.describe.order - b.describe.order)
        .map(({ describe }) => describe.text)
        .join('');
}
export function operationFields<T extends SurfaceOperation>(table: readonly T[]): Record<T['op'], readonly string[]> {
    return Object.fromEntries(
        [...table]
            .sort((a, b) => (a.fieldOrder ?? 0) - (b.fieldOrder ?? 0))
            .map(({ op, input, fieldRepeats }) => [op, [...Object.keys(input), ...(fieldRepeats ?? [])]]),
    ) as unknown as Record<T['op'], readonly string[]>;
}
export async function runOperation<Input, Table extends readonly Operation<Input>[]>(
    table: Table,
    op: string,
    ctx: ToolCtx,
    input: Input,
): Promise<Awaited<ReturnType<Table[number]['run']>>> {
    const operation = table.find((entry) => entry.op === op);
    if (!operation) throw new Error(`Unknown operation: ${op}`);
    return (await operation.run(ctx, input)) as Awaited<ReturnType<Table[number]['run']>>;
}
