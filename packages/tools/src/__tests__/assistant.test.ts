import { describe, expect, test } from 'bun:test';
import { curateAssistantHistory } from '../tools/assistant.js';

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
            turnActive: true,
            lastTurnOutcome: null,
            turnState: { id: 'turn-1', phase: 'running', outcome: null },
            messages: [{
                id: 'm1', role: 'assistant', createdAt: '2026-01-01T00:00:00Z', source: 'cloud',
                parts: [
                    { type: 'text', text: 'Hello', secret: 'drop me' },
                    { type: 'tool-invocation', toolCallId: 'tool-1', state: 'output-available', input: { token: 'secret' }, output: { huge: true } },
                    approval, question,
                    { type: 'tool-question', state: 'input-available', toolCallId: 'fallback-2', input: { questions: [{ title: 'Why?' }] } },
                ],
            }],
        });

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
            turnActive: false,
            messages: [{ id: 'm1', role: 'assistant', parts: [
                { type: 'tool-hitl-approval', state: 'output-available', toolCallId: 'permission-1', input: {} },
            ] }],
        });
        expect(result.turn).toBeNull();
        expect(result.pending).toEqual({ permissions: [], questions: [] });
    });
});
