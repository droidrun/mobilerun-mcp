import {
    operation,
    operationValues,
    operationInput,
    operationDescription,
    runOperation, registerBundle } from './operation-table.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const PLATFORM_CATALOG_SHARED_FIELDS = {

};

export const PLATFORM_CATALOG_TABLE = [
    operation({
        op: 'models',
        input: {  },
        access: 'read',
        describe: {
            order: 0,
            text: 'Read-only platform reference data, chosen via `catalog`: models (available LLM model ids), ',
        },
        run: async (ctx) => asTextResult(await ctx.backend.platformCatalog.listModels()),
    }),
    operation({
        op: 'timezones',
        input: {  },
        access: 'read',
        describe: {
            order: 1,
            text: "timezones (supported IANA timezone strings — use for workflows create_trigger scheduleRule's timezone field).",
        },
        run: async (ctx) => asTextResult(await ctx.backend.platformCatalog.listTimezones()),
    }),
] as const;

export function registerPlatformCatalogTools(server: McpServer, ctx: ToolCtx): void {
    
    registerBundle(server, ctx, 'platform_catalog', PLATFORM_CATALOG_TABLE, { shared: PLATFORM_CATALOG_SHARED_FIELDS, field: 'catalog' });
}
