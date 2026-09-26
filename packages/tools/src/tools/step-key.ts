// Stable per-step key handling for flows (template resolution v3: steps are
// referenced as `{{steps.<key>.body.<field>}}`). The pattern and reserved
// words here must stay byte-for-byte in sync with the server's own rule.
import type { FlowActionBinding, FlowActionDto, FlowChildActionInput } from '../backend/workflows.js';

const STEP_KEY_PATTERN = /^[a-z_][a-z0-9_-]{0,63}$/;
const MAX_STEP_KEY_LENGTH = 64;

const RESERVED_STEP_KEY_WORDS = new Set([
    'trigger',
    'flow',
    'event',
    'user',
    'now',
    'chaindepth',
    'steps',
    'prev',
    'source',
    'schedule',
    'loop',
    'results',
    'execution',
    'owner',
    '__proto__',
    'constructor',
    'prototype',
]);

export function isReservedStepKey(key: string): boolean {
    return key.startsWith('__') || RESERVED_STEP_KEY_WORDS.has(key);
}

export function isValidStepKey(key: string): boolean {
    return STEP_KEY_PATTERN.test(key) && !isReservedStepKey(key);
}

function slugifyStepKeyBase(name: string): string {
    let base = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (base.length === 0) base = 'step';
    if (/^[0-9]/.test(base)) base = `_${base}`;
    return base.slice(0, MAX_STEP_KEY_LENGTH);
}

// Derives a unique, valid step key from a human-readable step name: lowercase,
// runs of non `[a-z0-9]` collapse to `-`, leading/trailing `-` trimmed, a
// leading digit gets a `_` prefix, an empty result becomes `step`, truncated
// to 64 chars. A reserved word or a collision with `takenKeys` gets `_2`,
// `_3`, ... appended (truncating the base to keep the total at 64 chars).
export function deriveStepKey(name: string, takenKeys: ReadonlySet<string>): string {
    const base = slugifyStepKeyBase(name);
    if (isValidStepKey(base) && !takenKeys.has(base)) return base;

    for (let suffix = 2; ; suffix++) {
        const suffixStr = `_${suffix}`;
        const candidate = `${base.slice(0, MAX_STEP_KEY_LENGTH - suffixStr.length)}${suffixStr}`;
        if (isValidStepKey(candidate) && !takenKeys.has(candidate)) return candidate;
    }
}

type ReplaceActionNode = FlowActionBinding & { flowActionId?: string };

function hasMissingKey(nodes: readonly ReplaceActionNode[] | undefined): boolean {
    if (!nodes) return false;
    return nodes.some((node) => !node.key || hasMissingKey(node.children as ReplaceActionNode[] | undefined));
}

// Whether `replace_actions`' safety net needs to read the flow's current
// actions at all — skipped when the caller already supplied a key on every
// node (the common, cheap "trust the caller" path).
export function replaceActionsNeedsExistingLookup(actions: readonly ReplaceActionNode[]): boolean {
    return hasMissingKey(actions);
}

type ExistingAction = Pick<FlowActionDto, 'id' | 'key' | 'position' | 'parentFlowActionId'>;

function groupByParent(existing: readonly ExistingAction[]): Map<string | null, ExistingAction[]> {
    const byParent = new Map<string | null, ExistingAction[]>();
    for (const action of existing) {
        const siblings = byParent.get(action.parentFlowActionId);
        if (siblings) siblings.push(action);
        else byParent.set(action.parentFlowActionId, [action]);
    }
    return byParent;
}

function resolveNodes(
    nodes: readonly ReplaceActionNode[],
    byParent: Map<string | null, ExistingAction[]>,
    byId: Map<string, ExistingAction>,
    parentId: string | null,
    takenKeys: Set<string>,
): FlowActionBinding[] {
    const siblingsExisting = byParent.get(parentId) ?? [];
    return nodes.map((node) => {
        const { flowActionId, key: suppliedKey, children, ...rest } = node;
        const match = (flowActionId ? byId.get(flowActionId) : undefined) ?? siblingsExisting.find((a) => a.position === rest.position);
        const key = suppliedKey ?? match?.key ?? deriveStepKey(rest.nameOverride ?? rest.actionId, takenKeys);
        takenKeys.add(key);

        const resolved: FlowActionBinding = { ...rest, key };
        if (children) {
            resolved.children = resolveNodes(children as ReplaceActionNode[], byParent, byId, match?.id ?? null, takenKeys) as FlowChildActionInput[];
        }
        return resolved;
    });
}

// Fills in `key` for every node in a replace_actions payload: a caller-
// supplied key always wins; otherwise the key of the existing flow action at
// the same position (or matching `flowActionId`, when the caller has one
// from a prior response) is carried over; failing both, a fresh key is
// derived from the step's name. Existing keys are always avoided, even for
// actions this replace drops, to keep the result trivially collision-free.
export function resolveReplaceActionKeys(actions: readonly ReplaceActionNode[], existing: readonly ExistingAction[]): FlowActionBinding[] {
    const byParent = groupByParent(existing);
    const byId = new Map(existing.map((a) => [a.id, a] as const));
    const takenKeys = new Set(existing.map((a) => a.key));
    return resolveNodes(actions, byParent, byId, null, takenKeys);
}
