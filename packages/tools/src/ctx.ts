import type { Backend } from './backend/index.js';

/**
 * The authenticated principal a tool call runs as. REQUIRED on every
 * ToolCtx — identity is part of the authenticated principal, not merely
 * informative telemetry, so it can't be an optional afterthought.
 *
 * `ownerId` (tenancy) is required for `kind: 'oauth' | 'machine'` — those
 * credentials are always scoped to one org — and optional for `kind:
 * 'api_key'`, where the public API itself enforces tenancy via key scoping
 * and the resource server never learns the org. Construct via
 * `createAuthContext`, which enforces this invariant; don't build the
 * object literal directly.
 */
export interface AuthContext {
    readonly kind: 'api_key' | 'oauth' | 'machine';
    /** user/principal identifier. */
    readonly subject: string;
    /** Tenant (org). Required for kind oauth/machine — see above. */
    readonly ownerId?: string;
    /** OAuth client id (kind oauth). */
    readonly clientId?: string;
    readonly scopes?: readonly string[];
    /** Correlates to audit/revocation records. */
    readonly tokenId?: string;
    readonly expiresAt?: Date;
}

/**
 * Builds an immutable `AuthContext`, enforcing the `ownerId`-required-for-
 * oauth/machine invariant. Throws rather than returning a half-valid
 * context — hosts are expected to fail the request (401/500), never serve
 * a tool call with a context that violates its own type's contract.
 */
export function createAuthContext(input: AuthContext): AuthContext {
    if ((input.kind === 'oauth' || input.kind === 'machine') && !input.ownerId) {
        throw new Error(`AuthContext: "ownerId" is required for kind "${input.kind}"`);
    }
    return Object.freeze({ ...input });
}

/**
 * WHAT is reachable — the intersection of deployment-maximum ∩
 * credential-scopes ∩ org-RBAC. REQUIRED on every ToolCtx,
 * fail-closed: an empty `toolAllowlist` registers nothing (see
 * register.ts), never "everything" by default.
 *
 * `operationAllowlist` gates bundle tools (e.g. `webhooks`,
 * `list_workflow_resources`) at the operation/resource-enum level — a tool
 * name present in `toolAllowlist` can still have individual operation
 * values denied. A tool with no entry in the map has all of its operations
 * allowed (the map is a denylist-by-omission, not a default-deny).
 */
export interface Policy {
    readonly toolAllowlist: ReadonlySet<string>;
    readonly operationAllowlist?: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Auth-agnostic tool context. `backend` is the only way tool handlers touch
 * the outside world — never `fetch` directly (see backend/index.ts).
 * `auth` and `policy` are both REQUIRED — there is no
 * host-forgets-to-set-a-policy footgun; an empty policy is a valid,
 * explicit "register nothing" choice, not an accidental one.
 */
export type ToolCtx = {
    readonly backend: Backend;
    readonly auth: AuthContext;
    readonly policy: Policy;
};
