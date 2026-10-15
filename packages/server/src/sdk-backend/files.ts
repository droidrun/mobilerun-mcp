import { signedDownload, signedDownloadOpts } from './response.js';
import { type default as Mobilerun } from '@mobilerun/sdk';
import { type FilesBackend } from '@mobilerun/mcp-tools';

export function createFilesBackend(client: Mobilerun): FilesBackend {
    return {
        async filesDownload(params) {
            return signedDownload(client.files.download(params.fileId, signedDownloadOpts));
        },
        async filesList(params) {
            return client.files.list({ zone: params.zone });
        },
        async filesUpdate(params) {
            return client.files.update(params.fileId, {
                displayName: params.displayName,
                enabled: params.enabled,
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
                filename: params.filename,
                mimeType: params.mimeType,
                sizeBytes: params.sizeBytes,
                zone: params.zone,
            });
        },
    };
}
