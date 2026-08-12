// Shared helper for bundle tools (webhooks, list/get_workflow_resource) to
// narrow their operation/resource zod enum + description to what
// `ctx.policy.operationAllowlist` permits, at registration time — the
// server is fresh per request/connection, so `ctx` (and therefore the
// policy) is already known when these tools are registered. This is a
// UX/discoverability improvement ("don't advertise a value you'll reject")
// layered on top of, not a substitute for, the dispatch-time rejection in
// register.ts's enforcePolicy — that's the actual enforcement backstop.
export function narrowedValues<T extends string>(all: readonly T[], allowed: ReadonlySet<string> | undefined): readonly T[] {
    if (!allowed) return all;
    const filtered = all.filter((v) => allowed.has(v));
    // An allowlist entry that matches nothing in `all` is almost certainly a
    // host misconfiguration (e.g. a typo'd operation name) — fail open to the
    // full set here rather than advertising zero options; the dispatch-time
    // check still enforces the (empty, therefore always-denying) allowlist.
    return filtered.length > 0 ? filtered : all;
}

export function allowedValuesNote(narrowed: readonly string[], all: readonly string[]): string {
    if (narrowed.length === all.length) return '';
    return ` Available for this credential: ${narrowed.join(', ')}.`;
}
