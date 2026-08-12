import type { ToolCallEvent } from '@mobilerun/mcp-tools';

/**
 * Wires the core's `onToolCall` audit hook to a structured JSON-line log on
 * stderr — one line per tool call, machine-parseable, never token/args/
 * secrets (the event shape itself already excludes them; see register.ts's
 * ToolCallEvent). Deliberately stderr, not stdout: this sink
 * is shared with the stdio transport (see stdio.ts), where stdout is
 * reserved exclusively for JSON-RPC framing — see log.ts's header for the
 * same rationale applied to the rest of this package's logging.
 * A host with its own observability stack can replace this
 * with a real exporter without touching the core.
 */
export function logToolCall(event: ToolCallEvent): void {
    console.error(
        JSON.stringify({
            type: 'mcp.tool_call',
            ts: new Date().toISOString(),
            ...event,
        }),
    );
}
