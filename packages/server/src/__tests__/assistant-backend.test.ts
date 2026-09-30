import { describe, expect, test } from 'bun:test';
import Mobilerun, { APIConnectionTimeoutError, APIError } from '@mobilerun/sdk';
import { BackendError } from '@mobilerun/mcp-tools';
import { createAssistantBackend } from '../sdk-backend/assistant.js';
import { withBackendErrors } from '../sdk-backend/errors.js';

function clientWithSend(send: (...args: unknown[]) => Promise<unknown>): Mobilerun {
    return { assistant: { conversations: { send } } } as unknown as Mobilerun;
}

describe('assistant send mapping', () => {
    test('returns completed reply and disables retries', async () => {
        const calls: unknown[][] = [];
        const backend = createAssistantBackend(clientWithSend(async (...args) => {
            calls.push(args);
            return { chatSessionId: 's1', assistantText: 'Hello', errorText: 'warning' };
        }));
        expect(await backend.sendMessage('s1', 'Hi', 12)).toEqual({
            status: 'completed', chatSessionId: 's1', assistantText: 'Hello', errorText: 'warning',
        });
        expect(calls).toEqual([[{ sessionId: 's1', message: 'Hi' }, { timeout: 12000, maxRetries: 0 }]]);
    });

    test.each([
        new APIConnectionTimeoutError(),
        new APIError(504, { message: 'Gateway timeout' }, undefined, new Headers()),
    ])('returns running after timeout without suggesting a resend', async (error) => {
        const backend = createAssistantBackend(clientWithSend(async () => { throw error; }));
        expect(await backend.sendMessage('s1', 'Hi', 45)).toEqual({
            status: 'running',
            chatSessionId: 's1',
            next: 'Call assistant operation=get_messages to poll; do not resend the message.',
        });
    });

    test('maps 409 to polling guidance and keeps 402 upstream text', async () => {
        const conflict = withBackendErrors(createAssistantBackend(clientWithSend(async () => {
            throw new APIError(409, { message: 'Conflict' }, undefined, new Headers());
        })));
        await expect(conflict.sendMessage('s1', 'Hi', 45)).rejects.toThrow(
            'A turn is already running in this session; poll get_messages or call abort.',
        );

        const credits = withBackendErrors(createAssistantBackend(clientWithSend(async () => {
            throw new APIError(402, { message: 'Insufficient credits' }, undefined, new Headers());
        })));
        try {
            await credits.sendMessage('s1', 'Hi', 45);
            throw new Error('expected 402');
        } catch (error) {
            expect(error).toBeInstanceOf(BackendError);
            expect((error as BackendError).status).toBe(402);
            expect((error as BackendError).message).toContain('Insufficient credits');
        }
    });
});
