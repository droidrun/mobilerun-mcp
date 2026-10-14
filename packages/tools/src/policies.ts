// Server-start policy profiles: the public server MUST always construct a
// concrete policy — `policy: undefined` would be fail-open (every tool
// registered), which is exactly the footgun `ToolCtx.policy` being a
// required field (see ctx.ts) is meant to prevent. `policyForProfile` is the
// single place that turns a profile name into the `Policy` the core's
// `enforcePolicy` (register.ts) fail-closed-enforces at registration time —
// both the HTTP and stdio hosts call this instead of hand-building a Policy,
// so the three profiles stay identical across transports.
//
// Operation classifications come from the same tables as schemas and dispatch.

import { type Policy } from './ctx.js';
import { fullAccessPolicy } from './register.js';
import { BUNDLE_TOOLS, TOOL_METADATA } from './tools/bundle-tools.js';

export const POLICY_PROFILES = ['readonly', 'no-commerce', 'full'] as const;
export type PolicyProfile = (typeof POLICY_PROFILES)[number];

/** Classifications deliberately preserve each existing profile's operation surface. */
function bundleOperations(profile: 'readonly' | 'no-commerce'): ReadonlyMap<string, ReadonlySet<string>> {
    const entries: Array<[string, ReadonlySet<string>]> = [];
    for (const [name, { operations }] of Object.entries(BUNDLE_TOOLS)) {
        const allowed = operations.filter((operation) =>
            profile === 'readonly' ? operation.access === 'read' : operation.access !== 'commerce' && !('fullOnly' in operation && operation.fullOnly),
        );
        // readonly includes a bundle only if it has reads; no-commerce needs a gate only for billed operations.
        if (
            (profile === 'readonly' && allowed.length > 0) ||
            (profile === 'no-commerce' && allowed.length !== operations.length)
        ) {
            entries.push([name, new Set(allowed.map(({ op }) => op))]);
        }
    }
    return new Map(entries);
}

const READONLY_BUNDLE_OPERATIONS = bundleOperations('readonly');
const NO_COMMERCE_BUNDLE_OPERATIONS = bundleOperations('no-commerce');

function toolNames(profile: 'readonly' | 'no-commerce'): ReadonlySet<string> {
    return new Set(TOOL_METADATA.filter((tool) => 'access' in tool
        ? profile === 'readonly' ? tool.access === 'read' : tool.access !== 'commerce'
        : profile === 'no-commerce' || READONLY_BUNDLE_OPERATIONS.has(tool.name)
    ).map(({ name }) => name));
}

/**
 * Builds the `Policy` for one of the three server-start profiles:
 *
 * - `readonly` — only list_/get_ tools and `platform_catalog`, plus the
 *   read operations of bundle tools (see `READONLY_BUNDLE_OPERATIONS`).
 *   Mixed device and credential bundles expose only their read subsets.
 * - `no-commerce` (the required safe default) — everything
 *   except `create_device`/`terminate_device` (tool-level),
 *   billed number/mailbox/eSIM/device operations, `connect` purchases, and assistant
 *   write operations (operation-level).
 * - `full` — `fullAccessPolicy()`, i.e. every tool, no operation gates.
 */
export function policyForProfile(profile: PolicyProfile): Policy {
    switch (profile) {
        case 'full':
            return fullAccessPolicy();
        case 'no-commerce':
            return {
                toolAllowlist: toolNames('no-commerce'),
                operationAllowlist: NO_COMMERCE_BUNDLE_OPERATIONS,
            };
        case 'readonly':
            return {
                toolAllowlist: toolNames('readonly'),
                operationAllowlist: READONLY_BUNDLE_OPERATIONS,
            };
    }
}
