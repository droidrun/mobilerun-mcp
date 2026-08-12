// Unified typed error for the Backend ports. A `SdkBackend` (packages/server) or any other
// `Backend` implementation maps its own SDK/HTTP errors onto this shape;
// `asErrorResult` (text-result.ts) and the fail-closed wrapper in
// register.ts render it uniformly for the model, regardless of which
// backend or transport produced it.

export type BackendErrorCode =
    | 'not_found'
    | 'forbidden'
    | 'rate_limited'
    | 'upstream_error'
    | 'invalid_input';

export class BackendError extends Error {
    readonly code: BackendErrorCode;
    /** Origin HTTP status, when the backend has one (e.g. the upstream API's status). Not part of the MCP wire contract — informational only. */
    readonly status?: number;

    constructor(code: BackendErrorCode, message: string, status?: number) {
        super(message);
        this.name = 'BackendError';
        this.code = code;
        this.status = status;
    }
}
