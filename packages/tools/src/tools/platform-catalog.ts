import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { operation, registerBundle } from './operation-table.js';
const PLATFORM_CATALOG_SHARED_FIELDS = {};

const PLATFORM_CATALOG_INTRO = 'Read-only platform reference data, chosen via catalog.';
export const PLATFORM_CATALOG_TABLE = [
    operation({
        op: 'models',
        input: {},
        access: 'read',
        doc: 'Read available LLM model ids.',
        run: async (ctx) => asTextResult(await ctx.backend.platformCatalog.listModels()),
    }),
    operation({
        op: 'timezones',
        input: {},
        access: 'read',
        doc: 'Read supported IANA timezone strings; use for the scheduleRule timezone field in create_trigger.',
        run: async (ctx) => asTextResult(await ctx.backend.platformCatalog.listTimezones()),
    }),
] as const;

export function registerPlatformCatalogTools(server: McpServer, ctx: ToolCtx): void {
    registerBundle(server, ctx, 'platform_catalog', PLATFORM_CATALOG_TABLE, {
        intro: PLATFORM_CATALOG_INTRO,
        shared: PLATFORM_CATALOG_SHARED_FIELDS,
        field: 'catalog',
    });
}
