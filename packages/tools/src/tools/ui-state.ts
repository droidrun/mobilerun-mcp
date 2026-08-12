// Not a registered MCP tool itself — used by devices.ts's get_device_ui_state
// handler to compact the raw a11y tree returned by Backend.getDeviceUiState.
// Kept as its own file purely for readability.

// Hard limits so a dense screen (feeds, long lists) can never blow the
// LLM context. We compact the raw a11y tree to actionable/labeled nodes,
// then trim until it fits.
const MAX_NODES = 200;
const MAX_BYTES = 28_000;
const TEXT_MAX = 120;

// Raw a11y node — loosely typed defensively since the backend's raw response
// shape is not guaranteed field-by-field.
type RawNode = {
    boundsInScreen?: { left?: number; top?: number; right?: number; bottom?: number };
    className?: string;
    resourceId?: string;
    text?: string;
    contentDescription?: string;
    isCheckable?: boolean;
    isChecked?: boolean;
    isClickable?: boolean;
    isEnabled?: boolean;
    isFocused?: boolean;
    isScrollable?: boolean;
    isLongClickable?: boolean;
    isPassword?: boolean;
    isSelected?: boolean;
    isVisibleToUser?: boolean;
    children?: RawNode[];
};

export type CompactNode = {
    t?: string; // text
    d?: string; // contentDescription
    id?: string; // resourceId (package prefix stripped)
    c?: string; // className (last segment)
    xy: [number, number]; // tap center
    f?: string; // notable flags, comma-joined
};

type ScreenBounds = { width?: number; height?: number };
type FocusedElement = { className?: string; resourceId?: string; text?: string };

export type CompactUiState = {
    deviceId: string;
    app?: string;
    activity?: string;
    keyboardVisible: boolean;
    editing: boolean;
    focused?: FocusedElement;
    screen?: ScreenBounds;
    nodeCount: number;
    total: number;
    offset: number;
    deadTree: boolean;
    truncated: boolean;
    byteTruncated: boolean;
    hasMore: boolean;
    nextOffset?: number;
    filter?: UiStateFilter;
    nodes: CompactNode[];
};

function clip(value: string | undefined, max = TEXT_MAX): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function shortId(resourceId: string | undefined): string | undefined {
    if (!resourceId) return undefined;
    const slash = resourceId.lastIndexOf('/');
    return clip(slash >= 0 ? resourceId.slice(slash + 1) : resourceId, 60);
}

function shortClass(className: string | undefined): string | undefined {
    if (!className) return undefined;
    const dot = className.lastIndexOf('.');
    return dot >= 0 ? className.slice(dot + 1) : className;
}

function flagsOf(node: RawNode): string | undefined {
    const flags: string[] = [];
    if (node.isClickable) flags.push('clickable');
    if (node.isLongClickable) flags.push('longClickable');
    if (node.isScrollable) flags.push('scrollable');
    if (node.isCheckable) flags.push(node.isChecked ? 'checked' : 'checkable');
    if (node.isSelected) flags.push('selected');
    if (node.isFocused) flags.push('focused');
    if (node.isPassword) flags.push('password');
    if (node.isEnabled === false) flags.push('disabled');
    if (node.isVisibleToUser === false) flags.push('hidden');
    return flags.length ? flags.join(',') : undefined;
}

function isUseful(node: RawNode): boolean {
    return Boolean(
        clip(node.text) ||
            clip(node.contentDescription) ||
            node.isClickable ||
            node.isLongClickable ||
            node.isScrollable ||
            node.isCheckable,
    );
}

export type UiStateFilter = {
    contains?: string;
    resourceId?: string;
    includeAll?: boolean;
};

function matchesQuery(node: RawNode, filter: UiStateFilter): boolean {
    if (filter.resourceId) {
        const raw = node.resourceId ?? '';
        if (raw !== filter.resourceId && shortId(raw) !== filter.resourceId) return false;
    }
    if (filter.contains) {
        const needle = filter.contains.toLowerCase();
        const hay = `${node.text ?? ''}\n${node.contentDescription ?? ''}\n${node.resourceId ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
    }
    return true;
}

function keep(node: RawNode, filter: UiStateFilter): boolean {
    if (!matchesQuery(node, filter)) return false;
    return Boolean(filter.includeAll) || isUseful(node);
}

function center(node: RawNode): [number, number] {
    const b = node.boundsInScreen ?? {};
    const left = b.left ?? 0;
    const top = b.top ?? 0;
    const right = b.right ?? left;
    const bottom = b.bottom ?? top;
    return [Math.round((left + right) / 2), Math.round((top + bottom) / 2)];
}

function toCompact(node: RawNode): CompactNode {
    const text = node.isPassword ? '•••' : clip(node.text);
    const compact: CompactNode = { xy: center(node) };
    if (text) compact.t = text;
    const desc = clip(node.contentDescription);
    if (desc) compact.d = desc;
    const id = shortId(node.resourceId);
    if (id) compact.id = id;
    const cls = shortClass(node.className);
    if (cls) compact.c = cls;
    const flags = flagsOf(node);
    if (flags) compact.f = flags;
    return compact;
}

function flatten(
    root: RawNode | undefined,
    offset: number,
    limit: number,
    filter: UiStateFilter,
): { nodes: CompactNode[]; total: number } {
    const nodes: CompactNode[] = [];
    let total = 0;
    const queue: RawNode[] = root ? [root] : [];
    for (let head = 0; head < queue.length; head++) {
        const node = queue[head]!;
        if (keep(node, filter)) {
            if (total >= offset && nodes.length < limit) nodes.push(toCompact(node));
            total++;
        }
        if (Array.isArray(node.children)) queue.push(...node.children);
    }
    return { nodes, total };
}

/** Raw shape expected from Backend.getDeviceUiState — a loose superset of
 * @mobilerun/sdk's StateUiResponse, kept local so this package has no SDK dep. */
export type RawUiStateResponse = {
    a11y_tree?: unknown;
    phone_state?: {
        currentApp?: string;
        activityName?: string;
        keyboardVisible?: boolean;
        isEditable?: boolean;
        focusedElement?: FocusedElement;
    };
    device_context?: {
        screen_bounds?: ScreenBounds;
    };
};

export function compactUiState(
    deviceId: string,
    raw: RawUiStateResponse,
    filter: UiStateFilter = {},
    offset = 0,
): CompactUiState {
    const phone = raw.phone_state;
    const active = filter.contains || filter.resourceId || filter.includeAll ? filter : undefined;
    const start = Math.max(0, Math.floor(offset));
    const root = raw.a11y_tree as RawNode | undefined;
    const deadTree = !root || !Array.isArray(root.children) || root.children.length === 0;
    let { nodes, total } = flatten(root, start, MAX_NODES, filter);
    let byteTruncated = false;

    const build = (): CompactUiState => {
        const nextOffset = start + nodes.length;
        const hasMore = nextOffset < total;
        return {
            deviceId,
            app: phone?.currentApp,
            activity: phone?.activityName,
            keyboardVisible: Boolean(phone?.keyboardVisible),
            editing: Boolean(phone?.isEditable),
            focused: phone?.focusedElement,
            screen: raw.device_context?.screen_bounds,
            nodeCount: nodes.length,
            total,
            offset: start,
            deadTree,
            truncated: hasMore,
            byteTruncated,
            hasMore,
            ...(hasMore ? { nextOffset } : {}),
            ...(active ? { filter: active } : {}),
            nodes,
        };
    };

    let out = build();
    while (Buffer.byteLength(JSON.stringify(out), 'utf8') > MAX_BYTES && nodes.length > 1) {
        nodes = nodes.slice(0, Math.ceil(nodes.length * 0.9) - 1);
        byteTruncated = true;
        out = build();
    }
    return out;
}
