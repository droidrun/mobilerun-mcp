// Small result-shaping helpers shared by every tool. asErrorResult renders a
// BackendError uniformly alongside plain string/Error messages.
import { BackendError } from './backend/errors.js';

export function asTextResult(payload: unknown) {
    return {
        content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
    };
}

/**
 * An MCP tool result flagged as an error (model-facing message, no
 * payload). Accepts a plain string, an `Error`, or a `BackendError` — a
 * `BackendError` renders as `[code] message` so every backend/transport
 * that maps its own errors onto `BackendError` gets identical formatting
 * here, regardless of which one produced it.
 */
export function asErrorResult(input: string | Error) {
    if (input instanceof BackendError) {
        return { content: [{ type: 'text' as const, text: `[${input.code}] ${input.message}` }], isError: true as const };
    }
    const message = input instanceof Error ? input.message : input;
    return { content: [{ type: 'text' as const, text: message }], isError: true as const };
}

/**
 * Returns `{ [key]: value }` when value is not undefined, else `{}`.
 * Collapses the verbose `...(x !== undefined ? { x } : {})` spread pattern
 * used when forwarding optional filter params to SDK clients.
 */
export function ifDefined<K extends string, V>(
    key: K,
    value: V | undefined,
): { [P in K]?: V } {
    return value !== undefined ? ({ [key]: value } as { [P in K]?: V }) : {};
}

/**
 * Drops the deprecated `userId` field from a raw SDK response before it
 * reaches the LLM — `ownerId` (tenancy) / `createdBy` (actor) are the fields
 * to read instead. Everything else on the object passes through unchanged.
 */
export function omitUserId<T extends { userId?: unknown }>(data: T): Omit<T, 'userId'> {
    const { userId: _userId, ...rest } = data;
    return rest;
}
