// Structured logging helpers for the server package (Security-Audit 2026-08-12,
// items #6 and "d"). Two rules, everywhere in this package:
//   1. A caught `unknown`/`Error` is NEVER logged as the raw object — only
//      `sanitizeError` extracts `{ name, message }`. Raw Error/SDK/transport
//      objects can carry `cause` chains, request/response objects, or
//      headers (including `Authorization`) via non-enumerable/nested
//      properties that `console.error(err)` happily prints.
//   2. Every log line is one structured JSON object (level, msg, ts, fields)
//      via `log()`, consistent with audit-log.ts's tool-call events — no
//      bare `console.log('some string', obj)` calls.
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Reduces any caught value to `{ name, message }` — the only shape safe to
 * put in a log line. Deliberately drops `cause`, `stack`, and any other
 * enumerable properties an Error subclass (or an SDK/HTTP client's error
 * type) might carry.
 */
export function sanitizeError(err: unknown): { name: string; message: string } {
    if (err instanceof Error) return { name: err.name, message: err.message };
    return { name: 'UnknownError', message: String(err) };
}

/**
 * One structured JSON-line log — ALWAYS to stderr (console.error), every
 * level, no exceptions (Codex fix pack, 2026-08-12): this package is also
 * used by the stdio transport (see stdio.ts), where stdout is reserved
 * exclusively for JSON-RPC framing — a single stray console.log line
 * (info/debug included) corrupts the protocol stream for whatever client
 * is piping it. There is no per-transport branch here on purpose: keeping
 * one shared sink that's always stdio-safe is simpler and safer than
 * trusting every call site to know which transport it's running under.
 */
export function log(level: LogLevel, msg: string, fields: Record<string, unknown> = {}): void {
    const line = JSON.stringify({ level, msg, ts: new Date().toISOString(), ...fields });
    console.error(line);
}
