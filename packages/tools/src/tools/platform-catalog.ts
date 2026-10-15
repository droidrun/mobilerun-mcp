import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';

const CATALOG_VALUES = ['models', 'timezones'] as const;
type CatalogValue = (typeof CATALOG_VALUES)[number];
const catalogSchema = z.enum(CATALOG_VALUES);

async function executePlatformCatalogOperation(catalog: CatalogValue, ctx: ToolCtx): Promise<unknown> {
    switch (catalog) {
        case 'models':
            return ctx.backend.platformCatalog.listModels();
        case 'timezones':
            return ctx.backend.platformCatalog.listTimezones();
    }
}

export function registerPlatformCatalogTools(server: McpServer, ctx: ToolCtx): void {
    const catalogValues = narrowedValues(CATALOG_VALUES, ctx.policy.operationAllowlist?.get('platform_catalog'));

    server.registerTool(
        'platform_catalog',
        {
            description:
                'Read-only platform reference data, chosen via `catalog`: models (available LLM model ids), timezones ' +
                "(supported IANA timezone strings — use for workflows create_trigger scheduleRule's timezone field)." +
                allowedValuesNote(catalogValues, CATALOG_VALUES),
            inputSchema: {
                catalog: catalogSchema,
            },
        },
        async ({ catalog }: { catalog: CatalogValue }) =>
            asTextResult(await executePlatformCatalogOperation(catalog, ctx)),
    );
}
