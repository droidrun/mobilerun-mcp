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

type ExistingAction = Pick<FlowActionDto, 'id' | 'key' | 'actionId' | 'position' | 'parentFlowActionId'>;

function groupByParent(existing: readonly ExistingAction[]): Map<string | null, ExistingAction[]> {
    const byParent = new Map<string | null, ExistingAction[]>();
    for (const action of existing) {
        const siblings = byParent.get(action.parentFlowActionId);
        if (siblings) siblings.push(action);
        else byParent.set(action.parentFlowActionId, [action]);
    }
    return byParent;
}

function collectSuppliedKeys(nodes: readonly ReplaceActionNode[]): string[] {
    const out: string[] = [];
    for (const node of nodes) {
        if (node.key) out.push(node.key);
        if (node.children) out.push(...collectSuppliedKeys(node.children as ReplaceActionNode[]));
    }
    return out;
}

function resolveNodes(
    nodes: readonly ReplaceActionNode[],
    byParent: Map<string | null, ExistingAction[]>,
    byId: Map<string, ExistingAction>,
    parentId: string | null,
    parentIsNew: boolean,
    takenKeys: Set<string>,
    consumedMatchKeys: Set<string>,
): FlowActionBinding[] {
    // A position match is only trustworthy against the siblings of an
    // already-matched parent — an unmatched (new) parent has no existing
    // children to compare positions against, so its children are always new.
    const siblingsExisting = parentIsNew ? [] : (byParent.get(parentId) ?? []);
    return nodes.map((node) => {
        const { flowActionId, key: suppliedKey, children, ...rest } = node;
        const idMatch = flowActionId ? byId.get(flowActionId) : undefined;
        // Position alone is ambiguous under reordering/insertion — only trust
        // it when the existing node at that position is the same action.
        const positionMatch = siblingsExisting.find((a) => a.position === rest.position && a.actionId === rest.actionId);
        const match = idMatch ?? positionMatch;
        // A match already claimed elsewhere (by another node's carried-over
        // key, or by any caller-supplied key in this payload) is not reused —
        // each existing key is carried over at most once, and an explicit
        // caller key always outranks a fallback carry-over.
        const usableMatch = match && !consumedMatchKeys.has(match.key) ? match : undefined;

        let key: string;
        if (suppliedKey) {
            key = suppliedKey;
        } else if (usableMatch) {
            key = usableMatch.key;
            consumedMatchKeys.add(key);
        } else {
            key = deriveStepKey(rest.nameOverride ?? rest.actionId, takenKeys);
            takenKeys.add(key);
        }

        const resolved: FlowActionBinding = { ...rest, key };
        if (children) {
            resolved.children = resolveNodes(
                children as ReplaceActionNode[],
                byParent,
                byId,
                usableMatch?.id ?? null,
                !usableMatch,
                takenKeys,
                consumedMatchKeys,
            ) as FlowChildActionInput[];
        }
        return resolved;
    });
}

// Fills in `key` for every node in a replace_actions payload: a caller-
// supplied key always wins; otherwise the key of the existing flow action
// matching `flowActionId`, or (only when the existing node at the same
// position within the same parent is the same action — see resolveNodes)
// the same position, is carried over; failing both, a fresh key is derived
// from the step's name. Reordering or inserting steps without a `key` or
// `flowActionId` is safe but conservative: an ambiguous node is always
// treated as new rather than risking a wrong carry-over. Each existing key
// is carried over at most once, and a caller-supplied key always wins over a
// carry-over that would otherwise claim the same key. Existing keys are
// always avoided when deriving, even for actions this replace drops, to keep
// the result trivially collision-free.
export function resolveReplaceActionKeys(actions: readonly ReplaceActionNode[], existing: readonly ExistingAction[]): FlowActionBinding[] {
    const byParent = groupByParent(existing);
    const byId = new Map(existing.map((a) => [a.id, a] as const));
    const suppliedKeys = collectSuppliedKeys(actions);
    const takenKeys = new Set([...existing.map((a) => a.key), ...suppliedKeys]);
    const consumedMatchKeys = new Set(suppliedKeys);
    return resolveNodes(actions, byParent, byId, null, false, takenKeys, consumedMatchKeys);
}
