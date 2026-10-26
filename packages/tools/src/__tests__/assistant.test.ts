import { describe, expect, test } from 'bun:test';
import { curateAssistantHistory } from '../tools/assistant.js';
import { connect } from './connect.js';
import type { AssistantHistory } from '../backend/assistant.js';

describe('curateAssistantHistory', () => {
    test('extracts pending actions and keeps only useful message parts', () => {
        const approval = {
            type: 'tool-hitl-approval', state: 'input-available', toolCallId: 'permission-1',
            input: { action: 'devices.reset', title: 'Reset device?', params: { deviceId: 'd1' } },
        };
        const question = {
            type: 'tool-question', state: 'input-available', toolCallId: 'fallback-1',
            input: { questionID: 'question-1', questions: [{ title: 'Continue?' }] },
        };
        const result = curateAssistantHistory({
            turn: { turnActive: true, turnState: { id: 'turn-1', phase: 'running', outcome: null } },
            firstId: 'm1', lastId: 'm1', hasMore: true,
            data: [{
                id: 'm1', role: 'assistant', createdAt: '2026-01-01T00:00:00Z', source: 'cloud',
                parts: [
                    { type: 'text', text: 'Hello', secret: 'drop me' },
                    { type: 'tool-invocation', toolCallId: 'tool-1', state: 'output-available', input: { token: 'secret' }, output: { huge: true } },
                    approval, question,
                    { type: 'tool-question', state: 'input-available', toolCallId: 'fallback-2', input: { questions: [{ title: 'Why?' }] } },
                ],
            }],
        });

        expect(result.turnActive).toBe(true);
        expect(result.lastTurnOutcome).toBeNull();
        expect(result.hasMore).toBe(true);
        expect(result.before).toBe('m1');
        expect(result.turn).toEqual({ id: 'turn-1', phase: 'running', outcome: null });
        expect(result.messages[0]?.parts).toEqual([
            { type: 'text', text: 'Hello' },
            { type: 'tool-invocation', toolCallId: 'tool-1', state: 'output-available' },
            approval, question,
            { type: 'tool-question', state: 'input-available', toolCallId: 'fallback-2', input: { questions: [{ title: 'Why?' }] } },
        ]);
        expect(result.pending.permissions).toEqual([{
            permissionId: 'permission-1', action: 'devices.reset', title: 'Reset device?', params: { deviceId: 'd1' },
        }]);
        expect(result.pending.questions).toEqual([
            { questionId: 'question-1', questions: [{ title: 'Continue?' }] },
            { questionId: 'fallback-2', questions: [{ title: 'Why?' }] },
        ]);
        expect(JSON.stringify(result)).not.toContain('secret');
    });

    test('ignores resolved interactive parts', () => {
        const result = curateAssistantHistory({
            turn: { turnActive: false, turnState: null },
            firstId: 'm1', lastId: 'm1', hasMore: false,
            data: [{ id: 'm1', role: 'assistant', parts: [
                { type: 'tool-hitl-approval', state: 'output-available', toolCallId: 'permission-1', input: {} },
            ] }],
        });
        expect(result.turn).toBeNull();
        expect(result.pending).toEqual({ permissions: [], questions: [] });
    });

    test.each([
        { type: 'tool-hitl-approval', state: 'input-available', toolCallId: 'p', input: 'x' },
        { type: 'tool-hitl-approval', state: 'input-available', toolCallId: 'p' },
    ])('keeps the permission id when approval input is not an object', (part) => {
        const result = curateAssistantHistory({
            turn: { turnActive: true, turnState: null },
            firstId: 'm1', lastId: 'm1', hasMore: false,
            data: [{ id: 'm1', role: 'assistant', parts: [part] }],
        });
        expect(result.pending.permissions).toEqual([{
            permissionId: 'p', action: undefined, title: undefined, params: undefined,
        }]);
        expect(result.messages[0]?.parts).toEqual([part]);
    });

    test('tolerates missing or non-array parts and null parts', () => {
        // Exercise malformed upstream JSON despite the declared history type.
        const history = {
            turn: { turnActive: true, turnState: null },
            firstId: 'm1', lastId: 'm1', hasMore: false,
            data: [
                { id: 'm1', role: 'assistant' },
                { id: 'm2', role: 'assistant', parts: 'x' },
                { id: 'm3', role: 'assistant', parts: null },
                { id: 'm4', role: 'assistant', parts: [null, { type: 'text', text: 'Hello' }] },
            ],
        } as unknown as AssistantHistory;
        const result = curateAssistantHistory(history);
        expect(result.messages.map((message) => message.parts)).toEqual([
            [], [], [],
            [{ type: undefined, toolCallId: undefined, state: undefined }, { type: 'text', text: 'Hello' }],
        ]);
        expect(result.pending).toEqual({ permissions: [], questions: [] });
    });
});


describe('paged assistant history', () => {
    test('older and empty pages expose no live turn state', () => {
        const result = curateAssistantHistory({
            data: [], firstId: null, lastId: null, hasMore: false, turn: null,
        });
        expect(result).toEqual({
            messages: [], before: null, hasMore: false,
            turnActive: null, lastTurnOutcome: null, turn: null,
            pending: { permissions: [], questions: [] },
        });
    });

    test('maps the latest completed turn outcome', () => {
        const result = curateAssistantHistory({
            data: [], firstId: null, lastId: null, hasMore: false,
            turn: { turnActive: false, turnState: { id: 't1', phase: 'finished', outcome: 'completed' } },
        });
        expect(result.turnActive).toBe(false);
        expect(result.lastTurnOutcome).toBe('completed');
        expect(result.turn).toEqual({ id: 't1', phase: 'finished', outcome: 'completed' });
    });

    test('defaults to ten turns and forwards the older-page cursor', async () => {
        const { client, backend } = await connect('full', { recordArgs: true });
        await client.callTool({ name: 'assistant', arguments: { operation: 'get_messages', sessionId: 's1' } });
        await client.callTool({ name: 'assistant', arguments: {
            operation: 'get_messages', sessionId: 's1', limit: 20, before: 'm1',
        } });
        expect(backend.calls).toEqual([
            { method: 'assistant.getMessages', args: ['s1', 10, undefined] },
            { method: 'assistant.getMessages', args: ['s1', 20, 'm1'] },
        ]);
    });

    test.each([0, 21, 1.5])('rejects an invalid whole-turn limit: %s', async (limit) => {
        const { client, backend } = await connect('full', { recordArgs: true });
        const result = await client.callTool({ name: 'assistant', arguments: {
            operation: 'get_messages', sessionId: 's1', limit,
        } });
        expect(result.isError).toBe(true);
        expect(backend.calls).toEqual([]);
    });
});
