import { describe, expect, test } from 'bun:test';
import {
    deriveStepKey,
    isReservedStepKey,
    isValidStepKey,
    replaceActionsNeedsExistingLookup,
    resolveReplaceActionKeys,
} from '../tools/step-key.js';

describe('isValidStepKey / isReservedStepKey', () => {
    test('accepts a plain lowercase key', () => {
        expect(isValidStepKey('send_email')).toBe(true);
    });

    test('rejects uppercase, spaces, and other invalid characters', () => {
        expect(isValidStepKey('Send Email')).toBe(false);
        expect(isValidStepKey('send.email')).toBe(false);
    });

    test('rejects a key over 64 characters', () => {
        expect(isValidStepKey('a'.repeat(65))).toBe(false);
        expect(isValidStepKey('a'.repeat(64))).toBe(true);
    });

    test('rejects a leading digit', () => {
        expect(isValidStepKey('1step')).toBe(false);
        expect(isValidStepKey('_1step')).toBe(true);
    });

    test('rejects reserved words', () => {
        for (const word of ['trigger', 'flow', 'event', 'user', 'now', 'chaindepth', 'steps', 'prev', 'source', 'schedule', 'loop', 'results', 'execution', 'owner']) {
            expect(isReservedStepKey(word)).toBe(true);
            expect(isValidStepKey(word)).toBe(false);
        }
    });

    test('rejects the __ prefix and the specific prototype-pollution words', () => {
        expect(isReservedStepKey('__anything')).toBe(true);
        expect(isReservedStepKey('__proto__')).toBe(true);
        expect(isReservedStepKey('constructor')).toBe(true);
        expect(isReservedStepKey('prototype')).toBe(true);
        expect(isValidStepKey('__proto__')).toBe(false);
    });
});

describe('deriveStepKey', () => {
    test('slugifies a human-readable name', () => {
        expect(deriveStepKey('Send Email', new Set())).toBe('send-email');
    });

    test('collapses runs of non-alphanumeric characters and trims edges', () => {
        expect(deriveStepKey('  Send -- Email!! ', new Set())).toBe('send-email');
    });

    test('prefixes a leading digit with an underscore', () => {
        expect(deriveStepKey('123 Go', new Set())).toBe('_123-go');
    });

    test('falls back to "step" when the name has no alphanumeric characters', () => {
        expect(deriveStepKey('!!!', new Set())).toBe('step');
    });

    test('truncates to 64 characters', () => {
        const key = deriveStepKey('a'.repeat(100), new Set());
        expect(key.length).toBeLessThanOrEqual(64);
        expect(isValidStepKey(key)).toBe(true);
    });

    test('appends a numeric suffix on collision', () => {
        const taken = new Set(['send-email']);
        expect(deriveStepKey('Send Email', taken)).toBe('send-email_2');
    });

    test('keeps incrementing the suffix past an already-taken candidate', () => {
        const taken = new Set(['send-email', 'send-email_2']);
        expect(deriveStepKey('Send Email', taken)).toBe('send-email_3');
    });

    test('derives a non-reserved fallback when the slug itself is a reserved word', () => {
        const key = deriveStepKey('trigger', new Set());
        expect(isValidStepKey(key)).toBe(true);
        expect(key).not.toBe('trigger');
    });

    test('keeps the total length at 64 even with a long base and a suffix', () => {
        const taken = new Set([`${'a'.repeat(64)}`]);
        const key = deriveStepKey('a'.repeat(100), taken);
        expect(key.length).toBeLessThanOrEqual(64);
        expect(isValidStepKey(key)).toBe(true);
    });
});

describe('replaceActionsNeedsExistingLookup', () => {
    test('false when every node already has a key', () => {
        expect(replaceActionsNeedsExistingLookup([{ actionId: 'a', position: 1, key: 'a_key' }])).toBe(false);
    });

    test('true when a top-level node is missing a key', () => {
        expect(replaceActionsNeedsExistingLookup([{ actionId: 'a', position: 1 }])).toBe(true);
    });

    test('true when a nested child node is missing a key', () => {
        expect(
            replaceActionsNeedsExistingLookup([
                { actionId: 'a', position: 1, key: 'a_key', children: [{ actionId: 'b', position: 1 }] },
            ]),
        ).toBe(true);
    });

    test('false for an empty action list', () => {
        expect(replaceActionsNeedsExistingLookup([])).toBe(false);
    });
});

describe('resolveReplaceActionKeys', () => {
    test('passes through a caller-supplied key untouched', () => {
        const resolved = resolveReplaceActionKeys([{ actionId: 'a', position: 1, key: 'custom_key' }], []);
        expect(resolved[0]!.key).toBe('custom_key');
    });

    test('carries over the existing key by matching flowActionId', () => {
        const resolved = resolveReplaceActionKeys(
            [{ actionId: 'a', position: 5, flowActionId: 'fa-1' }],
            [{ id: 'fa-1', key: 'existing_key', position: 1, parentFlowActionId: null }],
        );
        expect(resolved[0]!.key).toBe('existing_key');
    });

    test('carries over the existing key by matching position within the same parent when no flowActionId is given', () => {
        const resolved = resolveReplaceActionKeys(
            [{ actionId: 'a', position: 1 }],
            [{ id: 'fa-1', key: 'existing_key', position: 1, parentFlowActionId: null }],
        );
        expect(resolved[0]!.key).toBe('existing_key');
    });

    test('derives a fresh key for a genuinely new node', () => {
        const resolved = resolveReplaceActionKeys([{ actionId: 'send_email', position: 1 }], []);
        expect(resolved[0]!.key).toBe('send-email');
    });

    test('prefers nameOverride over actionId when deriving a new key', () => {
        const resolved = resolveReplaceActionKeys([{ actionId: 'action_1', position: 1, nameOverride: 'Send Email' }], []);
        expect(resolved[0]!.key).toBe('send-email');
    });

    test('avoids colliding with an existing key kept elsewhere in the same replace', () => {
        const resolved = resolveReplaceActionKeys(
            [
                { actionId: 'send_email', position: 1 },
                { actionId: 'send_email', position: 2 },
            ],
            [],
        );
        expect(resolved[0]!.key).toBe('send-email');
        expect(resolved[1]!.key).toBe('send-email_2');
    });

    test('avoids colliding with an existing key belonging to an action being dropped from the replace', () => {
        const resolved = resolveReplaceActionKeys(
            [{ actionId: 'send_email', position: 1 }],
            [{ id: 'fa-old', key: 'send-email', position: 99, parentFlowActionId: null }],
        );
        expect(resolved[0]!.key).toBe('send-email_2');
    });

    test('matches existing siblings by position under the same parent, not across parents', () => {
        const resolved = resolveReplaceActionKeys(
            [{ actionId: 'a', position: 1, flowActionId: 'fa-parent', children: [{ actionId: 'b', position: 1 }] }],
            [
                { id: 'fa-parent', key: 'parent_key', position: 1, parentFlowActionId: null },
                { id: 'fa-child', key: 'child_key', position: 1, parentFlowActionId: 'fa-parent' },
                { id: 'fa-other-child', key: 'other_child_key', position: 1, parentFlowActionId: 'fa-other-parent' },
            ],
        );
        expect(resolved[0]!.key).toBe('parent_key');
        expect(resolved[0]!.children?.[0]?.key).toBe('child_key');
    });
});
