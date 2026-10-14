import { BackendError } from '@mobilerun/mcp-tools';
import type Mobilerun from '@mobilerun/sdk';
import type { FilesBackend } from '@mobilerun/mcp-tools';

export function createFilesBackend(client: Mobilerun): FilesBackend {
    return {
        async filesDownload(params) {
            return signedDownload(client.files.download(params.fileId));
        },
        async filesList(params) {
            return client.files.list({ zone: params['zone'] });
        },
        async filesUpdate(params) {
            return client.files.update(params.fileId, {
                displayName: params['displayName'],
                enabled: params['enabled'],
            });
        },
        async filesDelete(params) {
            return client.files.delete(params.fileId);
        },
        async filesCancelPending(params) {
            return client.files.cancelPending(params.fileId);
        },
        async filesConfirm(params) {
            return client.files.confirm(params.fileId);
        },
        async filesUploadUrl(params) {
            return client.files.uploadURL({
                filename: params['filename'],
                mimeType: params['mimeType'],
                sizeBytes: params['sizeBytes'],
                zone: params['zone'],
            });
        },
    };
}

/** Read the signed destination from the client's followed download redirect.
 * Cancel the response body: binary contents belong outside MCP JSON. */
export async function signedDownload(request: { asResponse(): Promise<Response> }): Promise<{ url: string }> {
    const response = await request.asResponse();
    await response.body?.cancel();
    if (!response.redirected || !response.url) {
        throw new BackendError('upstream_error', 'The download did not return a signed destination URL.');
    }
    return { url: response.url };
}

/** Screenshot capture returns PNG bytes, despite the client's string result type.
 * Read a bounded body directly from the client response instead of decoding it as text. */
export async function capturedImage(request: {
    asResponse(): Promise<Response>;
}): Promise<{ mimeType: string; contentBase64: string }> {
    const response = await request.asResponse();
    const mimeType = response.headers.get('content-type')?.split(';')[0];
    if (mimeType !== 'image/png') {
        await response.body?.cancel();
        throw new BackendError('upstream_error', 'Screenshot capture did not return a PNG image.');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new BackendError('upstream_error', 'Screenshot capture returned an empty body.');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 2 * 1024 * 1024) {
                await reader.cancel();
                throw new BackendError(
                    'upstream_error',
                    'Screenshot exceeds the 2 MB inline limit; use saved screenshot download URLs.',
                );
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }
    return { mimeType, contentBase64: Buffer.concat(chunks).toString('base64') };
}
