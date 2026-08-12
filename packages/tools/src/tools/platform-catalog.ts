// platform_catalog — read-only reference data. `catalog=app_event_types`
// dispatches to ctx.backend.workflows.listAppEventCatalog (the same
// backend method list_workflow_resources(resource="app_event_catalog")
// already uses) rather than duplicating that port — see
// backend/platform-catalog.ts.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

const CATALOG_VALUES = ['models', 'timezones', 'app_event_types'] as const;
type CatalogValue = (typeof CATALOG_VALUES)[number];
const catalogSchema = z.enum(CATALOG_VALUES);

export async function executePlatformCatalogOperation(catalog: CatalogValue, ctx: ToolCtx): Promise<unknown> {
    switch (catalog) {
        case 'models':
            return ctx.backend.platformCatalog.listModels();
        case 'timezones':
            return ctx.backend.platformCatalog.listTimezones();
        case 'app_event_types':
            return ctx.backend.workflows.listAppEventCatalog();
    }
}

export function registerPlatformCatalogTools(server: McpServer, ctx: ToolCtx): void {
    const catalogValues = narrowedValues(CATALOG_VALUES, ctx.policy.operationAllowlist?.get('platform_catalog'));

    server.registerTool(
        'platform_catalog',
        {
            description:
                'Read-only platform reference data, chosen via `catalog`: models (available LLM model ids), timezones ' +
                '(supported IANA timezone strings — use for workflows create_trigger scheduleRule\'s timezone field), ' +
                'app_event_types (same data as list_workflow_resources(resource="app_event_catalog") — every selectable ' +
                'app/system event type).' +
                allowedValuesNote(catalogValues, CATALOG_VALUES),
            inputSchema: {
                catalog: catalogSchema,
            },
        },
        async ({ catalog }: { catalog: CatalogValue }) => asTextResult(await executePlatformCatalogOperation(catalog, ctx)),
    );
}
