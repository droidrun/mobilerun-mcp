import { APIError } from '@mobilerun/sdk';
import { BackendError, type BackendErrorCode } from '@mobilerun/mcp-tools';

function codeForStatus(status: number | undefined): BackendErrorCode {
    switch (status) {
        case 400:
        case 422:
            return 'invalid_input';
        case 401:
        case 403:
            return 'forbidden';
        case 404:
            return 'not_found';
        case 429:
            return 'rate_limited';
        default:
            return 'upstream_error';
    }
}

/** Maps a thrown @mobilerun/sdk error (or anything else) onto the tools
 * package's typed `BackendError`, so every error the tool layer sees is
 * rendered uniformly by `asErrorResult` regardless of what the upstream SDK
 * call actually threw. */
export function toBackendError(err: unknown): BackendError {
    if (err instanceof BackendError) return err;
    if (err instanceof APIError) {
        return new BackendError(codeForStatus(err.status), err.message, err.status);
    }
    const message = err instanceof Error ? err.message : String(err);
    return new BackendError('upstream_error', message);
}

/** Wraps every async method of a domain backend object (e.g. the object
 * returned by `createDevicesBackend`) so a thrown SDK/API error becomes a
 * typed `BackendError` before it reaches the tool layer — applied once per
 * domain in sdk-backend/index.ts rather than requiring every method body to
 * catch-and-map individually. */
export function withBackendErrors<T extends object>(impl: T): T {
    return new Proxy(impl, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (typeof value !== 'function') return value;
            return async (...args: unknown[]) => {
                try {
                    return await (value as (...a: unknown[]) => unknown).apply(target, args);
                } catch (err) {
                    throw toBackendError(err);
                }
            };
        },
    });
}
