import type Mobilerun from '@mobilerun/sdk';
import type { PlatformCatalogBackend } from '@mobilerun/mcp-tools';

export function createPlatformCatalogBackend(client: Mobilerun): PlatformCatalogBackend {
    return {
        async listModels() {
            return client.models.list();
        },
        async listTimezones() {
            return client.workflows.timezones.list();
        },
    };
}
