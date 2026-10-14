/** Shared operation validation; optional tool prefixes preserve existing error text. */
export function requireValue<T>(value: T | undefined, name: string, operation: string, tool = ''): T {
    if (value === undefined) throw new Error(
        (tool ? tool + ' ' : '') + `operation=${operation} requires ${name}`,
    );
    return value;
}

export function disallowedFieldError(
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
    required: readonly string[] | undefined,
    filters: object,
): string | null {
    const input = filters as Record<string, unknown>;
    const extra = allKeys.filter((k) => input[k] !== undefined && !allowed.includes(k));
    if (extra.length > 0) {
        return `filter ${extra.join(', ')} is not valid for resource=${resource}; allowed filters: ${allowed.join(', ') || '(none)'}`;
    }
    const missing = required?.filter((k) => input[k] === undefined) ?? [];
    if (missing.length > 0) return `resource=${resource} requires filter: ${missing.join(', ')}`;
    return null;
}
