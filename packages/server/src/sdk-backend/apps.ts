import type Mobilerun from '@mobilerun/sdk';
import type { AppsBackend, CreateUploadUrlParams, ListAppsOpts } from '@mobilerun/mcp-tools';

export function createAppsBackend(client: Mobilerun): AppsBackend {
    return {
        async listApps(opts: ListAppsOpts) {
            return client.apps.list({
                query: opts.query,
                platform: opts.platform,
                status: opts.status,
                sortBy: opts.sortBy,
                order: opts.order,
                page: opts.page,
                pageSize: opts.pageSize,
            });
        },
        async getApp(id: string) {
            return client.apps.retrieve(id);
        },
        async listAppVersions(id: string) {
            return client.apps.listVersions(id);
        },
        async createAppUploadUrl(params: CreateUploadUrlParams) {
            return client.apps.createSignedUploadURL(params);
        },
        async confirmAppUpload(id: string) {
            return client.apps.confirmUpload(id);
        },
        async markAppUploadFailed(id: string) {
            return client.apps.markFailed(id);
        },
        async deleteApp(id: string) {
            return client.apps.delete(id);
        },
    };
}
