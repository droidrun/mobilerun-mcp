import { describe, expect, test } from 'bun:test';
import type Mobilerun from '@mobilerun/sdk';
import { APIConnectionError, APIConnectionTimeoutError, APIError } from '@mobilerun/sdk';
import { BackendError } from '@mobilerun/mcp-tools';
import { SdkClient } from '../sdk-backend/request-options.js';
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
            return { chatSessionId: 's1', assistantText: 'Hello', errorText: 'warning', status: 'unexpected', extra: 'drop me' };
        }));
        expect(await backend.sendMessage('s1', 'Hi', 12)).toEqual({
            status: 'completed', chatSessionId: 's1', assistantText: 'Hello', errorText: 'warning',
        });
        expect(calls).toEqual([[{ sessionId: 's1', message: 'Hi' }, { timeout: 12000, maxRetries: 0 }]]);
    });

    test('omits absent errorText in a completed reply', async () => {
        const backend = createAssistantBackend(clientWithSend(async () => ({
            chatSessionId: 's1', assistantText: 'Hello',
        })));
        const result = await backend.sendMessage('s1', 'Hi', 12);
        expect(result).toEqual({ status: 'completed', chatSessionId: 's1', assistantText: 'Hello' });
        expect(result).not.toHaveProperty('errorText');
    });

    test('connection failure warns to check history before resending', async () => {
        const backend = withBackendErrors(createAssistantBackend(clientWithSend(async () => {
            throw new APIConnectionError({ message: 'Socket reset.' });
        })));
        try {
            await backend.sendMessage('s1', 'Hi', 45);
            throw new Error('expected connection failure');
        } catch (error) {
            expect(error).toBeInstanceOf(BackendError);
            expect((error as BackendError).code).toBe('upstream_error');
            expect((error as BackendError).message).toBe(
                'Socket reset. the message may have been delivered; call get_messages before resending.',
            );
        }
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

describe('assistant session creation', () => {
    test('uses fresh client keys for each session', async () => {
        const requests: Array<{ body: unknown; key: string | null }> = [];
        const session = {
            id: 's1', title: 'Chat', description: null, status: 'active', pinned: false,
            turnActive: false, lastActiveAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z', costUsd: 0,
        };
        const backend = createAssistantBackend(new SdkClient({
            apiKey: 'test-key', baseURL: 'https://example.com',
            fetch: async (_input, init) => {
                requests.push({ body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined, key: new Headers(init?.headers).get('Idempotency-Key') });
                return Response.json({ session });
            },
        }));
        await backend.createSession('Chat', 'Description');
        await backend.createSession('Chat', 'Description');
        expect(requests[0]?.body).toEqual({ title: 'Chat', description: 'Description' });
        expect(requests[0]?.key).toBeTruthy();
        expect(requests[1]?.key).not.toBe(requests[0]?.key);
    });
});


describe('assistant paged history', () => {
    test.each([undefined, 'older-message'])('requests the session route with cursor %s', async (before) => {
        const urls: URL[] = [];
        const history = {
            data: [], firstId: null, lastId: null, hasMore: false, turn: null, agent: null,
        };
        const backend = createAssistantBackend(new SdkClient({
            apiKey: 'test-key', baseURL: 'https://example.com',
            fetch: async (input) => {
                urls.push(new URL(input instanceof Request ? input.url : String(input)));
                return Response.json(history);
            },
        }));
        expect(await backend.getMessages('s1', 10, before)).toEqual(history);
        expect(urls[0]?.pathname).toBe('/assistant/chat/sessions/s1/messages');
        expect(urls[0]?.searchParams.get('limit')).toBe('10');
        expect(urls[0]?.searchParams.get('before')).toBe(before ?? null);
        expect(urls[0]?.searchParams.has('sessionId')).toBe(false);
    });
});
