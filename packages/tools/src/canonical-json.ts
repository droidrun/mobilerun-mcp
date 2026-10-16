/** Stable object-key ordering; array order remains significant. */
export function canonicalJson(value: unknown, options: { omitDescriptions?: boolean } = {}): string {
    return JSON.stringify(value, (key, item: unknown) => {
        if (options.omitDescriptions && key === 'description' && typeof item === 'string') return undefined;
        if (item && typeof item === 'object' && !Array.isArray(item)) {
            return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
        }
        return item;
    });
}
