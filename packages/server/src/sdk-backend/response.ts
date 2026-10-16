import { APIError, type default as Mobilerun } from '@mobilerun/sdk';
import { BackendError, MAX_INLINE_FILE_BYTES } from '@mobilerun/mcp-tools';

const BODY_READ_TIMEOUT_MS = 5000;

export const signedDownloadOpts = { fetchOptions: { redirect: 'manual' as const }, maxRetries: 0 };

/** Manual redirects avoid starting an object download just to read its URL.
 * The client rejects non-2xx responses, exposing the redirect through APIError. */
export async function signedDownload(request: { asResponse(): Promise<Response> }): Promise<{ url: string }> {
    try {
        const response = await request.asResponse();
        await response.body?.cancel();
        const location = response.headers.get('location');
        if (response.status >= 300 && response.status < 400 && location) return { url: location };
        if (response.redirected && response.url) return { url: response.url };
    } catch (error) {
        if (error instanceof APIError && error.status !== undefined && error.status >= 300 && error.status < 400) {
            const url = error.headers?.get('location');
            if (url) return { url };
        }
        throw error;
    }
    throw new BackendError('upstream_error', 'The download did not return a signed destination URL.');
}

export function captureDeviceScreenshot(
    client: Mobilerun,
    deviceId: string,
    params: { hideOverlay?: boolean; save?: boolean; displayId?: number } = {},
): Promise<{ mimeType: 'image/png'; contentBase64: string }> {
    return capturedImage(
        client.devices.screenshots.capture(deviceId, {
            hideOverlay: params.hideOverlay,
            save: params.save,
            ...headerOpts(params.displayId),
        }),
    );
}

export function headerOpts(displayId: number | undefined) {
    return displayId !== undefined ? { 'X-Device-Display-ID': displayId } : {};
}

/** Bound both decoded size and body-read time after the client returns headers. */
export async function capturedImage(
    request: { asResponse(): Promise<Response> },
    timeoutMs = BODY_READ_TIMEOUT_MS,
): Promise<{ mimeType: 'image/png'; contentBase64: string }> {
    const response = await request.asResponse();
    if (response.headers.get('content-type')?.split(';')[0] !== 'image/png') {
        void response.body?.cancel().catch(() => {});
        throw new BackendError('upstream_error', 'Screenshot capture did not return a PNG image.');
    }
    const content = await readBoundedBody(response, 'Screenshot', timeoutMs, ' use saved screenshot download URLs.');
    return { mimeType: 'image/png', contentBase64: content.toString('base64') };
}

/** Bound decoded bytes and time without buffering an unbounded response. */
export async function readBoundedBody(response: Response, label: string, timeoutMs = BODY_READ_TIMEOUT_MS, oversizeHint = ''): Promise<Buffer> {
    const oversizeError = new BackendError('upstream_error', `${label} exceeds the ${MAX_INLINE_FILE_BYTES / 1024} KB inline limit.${oversizeHint}`);
    const length = response.headers.get('content-length');
    if (length && /^\d+$/.test(length) && Number(length) > MAX_INLINE_FILE_BYTES) {
        void response.body?.cancel().catch(() => {});
        throw oversizeError;
    }
    const reader = response.body?.getReader();
    if (!reader) throw new BackendError('upstream_error', `${label} returned an empty body.`);
    const chunks: Uint8Array[] = [];
    let size = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
            reject(new BackendError('upstream_error', `${label} body read timed out.`));
            void reader.cancel().catch(() => {});
        }, timeoutMs);
    });
    try {
        while (true) {
            const { done, value } = await Promise.race([reader.read(), timeout]);
            if (done) break;
            size += value.byteLength;
            if (size > MAX_INLINE_FILE_BYTES) {
                void reader.cancel().catch(() => {});
                throw oversizeError;
            }
            chunks.push(value);
        }
    } finally {
        clearTimeout(timer);
        reader.releaseLock();
    }
    return Buffer.concat(chunks);
}

/** Surface a replay marker without a separate request or parsing the response twice. */
export async function purchaseResult<Value extends object>(request: {
    withResponse(): Promise<{ data: Value; response: Response }>;
}): Promise<Value & { replayed?: true }> {
    const { data, response } = await request.withResponse();
    return response.headers.get('Idempotent-Replayed')?.toLowerCase() === 'true' ? { ...data, replayed: true } : data;
}
