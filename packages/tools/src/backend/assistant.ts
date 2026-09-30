export interface AssistantSession {
    id: string;
    title: string;
    description: string | null;
    status: string;
    pinned: boolean;
    turnActive: boolean;
    lastActiveAt: string;
    createdAt: string;
    costUsd: number;
}

export interface AssistantHistory {
    turnActive: boolean;
    lastTurnOutcome?: string | null;
    turnState?: { id: string; phase: string; outcome: string | null } | null;
    messages: Array<{
        id: string;
        role: string;
        createdAt?: string;
        source?: string;
        parts: Array<{ type: string; [key: string]: unknown }>;
    }>;
}

export type AssistantAnswer = Array<Array<{ label: string } | { custom: string } | { label: string; custom: string }>>;

export interface AssistantBackend {
    listSessions(mine?: boolean): Promise<{ sessions: AssistantSession[] }>;
    createSession(title: string, description?: string): Promise<{ session: AssistantSession }>;
    updateSession(sessionId: string, params: { title?: string; description?: string; pinned?: boolean; status?: 'active' | 'archived' }): Promise<{ session: AssistantSession }>;
    sendMessage(sessionId: string, message: string, waitSeconds: number): Promise<
        | { status: 'completed'; chatSessionId: string; assistantText: string; errorText?: string }
        | { status: 'running'; chatSessionId: string; next: string }
    >;
    getMessages(sessionId: string, limit: number): Promise<AssistantHistory>;
    abort(sessionId: string, expectedTurnId?: string): Promise<{ ok: true }>;
    answerPermission(permissionId: string, response: 'once' | 'reject'): Promise<{ ok: true }>;
    answerQuestion(questionId: string, answers: AssistantAnswer): Promise<{ ok: true }>;
    rejectQuestion(questionId: string): Promise<{ ok: true }>;
}
