import type Mobilerun from '@mobilerun/sdk';
import { APIConnectionError, APIConnectionTimeoutError, APIError } from '@mobilerun/sdk';
import { BackendError, type AssistantBackend, type AssistantSession } from '@mobilerun/mcp-tools';

function sessionSummary(session: AssistantSession): AssistantSession {
    const { id, title, description, status, pinned, turnActive, lastActiveAt, createdAt, costUsd } = session;
    return { id, title, description, status, pinned, turnActive, lastActiveAt, createdAt, costUsd };
}

export function createAssistantBackend(client: Mobilerun): AssistantBackend {
    const conversations = client.assistant.conversations;
    return {
        async listSessions(mine) {
            const result = await conversations.list({ kind: 'chat', mine: mine ? 'true' : undefined });
            return { sessions: result.sessions.map(sessionSummary) };
        },
        async createSession(title, description) {
            const result = await conversations.create({ title, description });
            return { session: sessionSummary(result.session) };
        },
        async updateSession(sessionId, params) {
            const result = await conversations.update(sessionId, params);
            return { session: sessionSummary(result.session) };
        },
        async sendMessage(sessionId, message, waitSeconds) {
            try {
                const result = await conversations.send(
                    { sessionId, message },
                    { timeout: waitSeconds * 1000, maxRetries: 0 },
                );
                return {
                    status: 'completed',
                    chatSessionId: result.chatSessionId,
                    assistantText: result.assistantText,
                    ...(result.errorText !== undefined && { errorText: result.errorText }),
                };
            } catch (err) {
                if (err instanceof APIConnectionTimeoutError || (err instanceof APIError && err.status === 504)) {
                    return {
                        status: 'running',
                        chatSessionId: sessionId,
                        next: 'Call assistant operation=get_messages to poll; do not resend the message.',
                    };
                }
                if (err instanceof APIError && err.status === 409) {
                    throw new BackendError('upstream_error', 'A turn is already running in this session; poll get_messages or call abort.', 409);
                }
                if (err instanceof APIConnectionError) {
                    throw new BackendError('upstream_error', `${err.message} the message may have been delivered; call get_messages before resending.`);
                }
                throw err;
            }
        },
        getMessages(sessionId, limit) {
            return conversations.history({ sessionId, limit });
        },
        abort(sessionId, expectedTurnId) {
            return conversations.abort({ sessionId, expectedTurnId });
        },
        answerPermission(permissionId, response) {
            return conversations.answerPermission({ permissionId, response });
        },
        answerQuestion(questionId, answers) {
            return conversations.answerQuestion({ questionId, answers });
        },
        rejectQuestion(questionId) {
            return conversations.rejectQuestion({ questionId });
        },
    };
}
