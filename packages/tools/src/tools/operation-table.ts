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
    access: 'read' | 'write' | 'commerce';
    /** Assistant writes retain their existing full-profile gate. */
    fullOnly?: boolean;
    /** Ordered fragments preserve existing prose even when enum and prose orders differ. */
    describe: {
        order: number;
        text: string;
    };
    run: (ctx: ToolCtx, input: Input) => Promise<Result>;
};
type SurfaceOperation = Pick<
    Operation<never>,
    'op' | 'input' | 'access' | 'fullOnly' | 'describe' | 'fieldOrder' | 'fieldRepeats'
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
    return Object.assign({}, ...table.map(({ input }) => input), shared);
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
