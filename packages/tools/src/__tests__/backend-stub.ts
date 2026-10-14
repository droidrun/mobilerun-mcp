import type { Backend } from '../backend/index.js';

type Call = { method: string; args: unknown[] };
const responses: Record<string, unknown> = {
    'devices.getDeviceUiState': { a11y_tree: { children: [] }, phone_state: {} },
    'workflows.listFlowActions': { items: [] },
    'workflows.ingestEvent': { eventId: 'evt_1' },
    'assistant.listSessions': { sessions: [] },
    'assistant.getMessages': { turnActive: false, messages: [] },
    'credentials.initPackage': { data: { packageName: 'p' }, message: 'ok', success: true },
    'credentials.createCredential': { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [] }, message: 'ok', success: true },
    'credentials.deleteCredential': { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [] }, message: 'ok', success: true },
    'credentials.addField': { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [{ fieldType: 'password' }] }, message: 'ok', success: true },
    'credentials.updateField': { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [{ fieldType: 'password' }] }, message: 'ok', success: true },
    'credentials.deleteField': { data: { credentialName: 'c', packageName: 'p', userId: 'u', secretPath: 's', fields: [] }, message: 'ok', success: true },
    'tasks.getTaskTrajectory': { events: [] },
    'deviceControl.downloadFile': { content: 'ok' },
};

export function stubBackend(): Backend & { calls: string[] };
export function stubBackend(options: { recordArgs: true; responses?: Record<string, unknown> }): Backend & { calls: Call[] };
export function stubBackend(options?: { recordArgs: true; responses?: Record<string, unknown> }): Backend & { calls: string[] | Call[] } {
    const calls: Array<string | Call> = [];
    const domains = new Map<PropertyKey, object>();
    return new Proxy({ calls }, {
        get(target, domain) {
            if (domain === 'calls') return target.calls;
            if (!domains.has(domain)) domains.set(domain, new Proxy({}, {
                get(target, method) {
                    if (Reflect.has(target, method)) return Reflect.get(target, method);
                    return async (...args: unknown[]) => {
                        const name = String(domain) + '.' + String(method);
                        calls.push(options?.recordArgs ? { method: name, args } : name);
                        return options?.responses?.[name] ?? structuredClone(responses[name] ?? { ok: true });
                    };
                },
            }));
            return domains.get(domain);
        },
    }) as Backend & { calls: string[] | Call[] };
}
