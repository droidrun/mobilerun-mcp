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
import { ALL_TOOL_NAMES, fullAccessPolicy } from './register.js';
import { BUNDLE_TOOLS } from './tools/bundle-tools.js';

export const POLICY_PROFILES = ['readonly', 'no-commerce', 'full'] as const;
export type PolicyProfile = (typeof POLICY_PROFILES)[number];

/** Tools that only ever read: list_/get_ prefixed standalone tools, plus
 * reference data. Bundle tools are NOT here — they're tool-allowlisted below with a per-tool
 * `operationAllowlist` entry instead. */
const READONLY_TOOL_NAMES = new Set<string>([
    'list_devices',
    'get_device',
    'get_device_screenshot',
    'get_device_ui_state',
    'list_apps_on_device',
    'list_credentials',
    'list_credential_packages',
    'list_tasks',
]);

/** Classifications deliberately preserve each existing profile's operation surface. */
function bundleOperations(profile: 'readonly' | 'no-commerce'): ReadonlyMap<string, ReadonlySet<string>> {
    const entries: Array<[string, ReadonlySet<string>]> = [];
    for (const [name, { operations }] of Object.entries(BUNDLE_TOOLS)) {
        const allowed = operations.filter((operation) =>
            profile === 'readonly' ? operation.readonly : !operation.billed,
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

/** Existing tool-level exclusions for provisioning and destroying billed devices. */
const COMMERCE_TOOL_NAMES = new Set<string>(['create_device', 'terminate_device']);

function toolNames(filter: (name: string) => boolean): ReadonlySet<string> {
    return new Set(ALL_TOOL_NAMES.filter(filter));
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
                toolAllowlist: toolNames((name) => !COMMERCE_TOOL_NAMES.has(name)),
                operationAllowlist: NO_COMMERCE_BUNDLE_OPERATIONS,
            };
        case 'readonly':
            return {
                toolAllowlist: toolNames(
                    (name) => READONLY_TOOL_NAMES.has(name) || READONLY_BUNDLE_OPERATIONS.has(name),
                ),
                operationAllowlist: READONLY_BUNDLE_OPERATIONS,
            };
    }
}
