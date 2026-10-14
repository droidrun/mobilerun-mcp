import {
    type Operation,
    operationValues,
    operationInput,
    selectInput,
    operationDescription,
    runOperation,
} from './operation-table.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolCtx } from '../ctx.js';
import { asTextResult } from '../text-result.js';
import { allowedValuesNote, narrowedValues } from './policy-schema.js';
const PLATFORM_CATALOG_INPUT_FIELDS = {};
type PlatformCatalogInput = z.infer<z.ZodObject<typeof PLATFORM_CATALOG_INPUT_FIELDS>> & {
    catalog: string;
};
export const PLATFORM_CATALOG_TABLE = [
    {
        op: 'models',
        input: selectInput(PLATFORM_CATALOG_INPUT_FIELDS, []),
        readonly: true,
        billed: false,
        describe: {
            order: 0,
            text: 'Read-only platform reference data, chosen via `catalog`: models (available LLM model ids), ',
        },
        run: async (ctx) => ctx.backend.platformCatalog.listModels(),
    },
    {
        op: 'timezones',
        input: selectInput(PLATFORM_CATALOG_INPUT_FIELDS, []),
        readonly: true,
        billed: false,
        describe: {
            order: 1,
            text: "timezones (supported IANA timezone strings — use for workflows create_trigger scheduleRule's timezone field).",
        },
        run: async (ctx) => ctx.backend.platformCatalog.listTimezones(),
    },
] as const satisfies readonly Operation<PlatformCatalogInput, unknown>[];
const CATALOG_VALUES = operationValues(PLATFORM_CATALOG_TABLE);
export function registerPlatformCatalogTools(server: McpServer, ctx: ToolCtx): void {
    const catalogValues = narrowedValues(CATALOG_VALUES, ctx.policy.operationAllowlist?.get('platform_catalog'));
    server.registerTool(
        'platform_catalog',
        {
            description:
                operationDescription(PLATFORM_CATALOG_TABLE) + allowedValuesNote(catalogValues, CATALOG_VALUES),
            inputSchema: {
                catalog: z.enum(CATALOG_VALUES),
                ...operationInput(PLATFORM_CATALOG_TABLE, PLATFORM_CATALOG_INPUT_FIELDS),
            },
        },
        async (input) => asTextResult(await runOperation(PLATFORM_CATALOG_TABLE, input.catalog, ctx, input)),
    );
}
