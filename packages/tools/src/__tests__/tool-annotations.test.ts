import { expect, test } from 'bun:test';
import { ALL_TOOL_NAMES } from '../register.js';
import { connect } from './connect.js';

test('every tool lists a title with readOnlyHint and destructiveHint', async () => {
    const { client, close } = await connect('full');
    try {
        const { tools } = await client.listTools();
        expect(tools).toHaveLength(ALL_TOOL_NAMES.length);
        for (const tool of tools) {
            expect(tool.title?.trim(), `${tool.name}: title`).toBeTruthy();
            expect(typeof tool.annotations?.readOnlyHint, `${tool.name}: readOnlyHint`).toBe('boolean');
            expect(typeof tool.annotations?.destructiveHint, `${tool.name}: destructiveHint`).toBe('boolean');
            if (tool.annotations?.readOnlyHint) expect(tool.annotations.destructiveHint, tool.name).toBe(false);
        }

        const hints = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));
        expect(hints.list_devices).toMatchObject({ readOnlyHint: true, destructiveHint: false });
        expect(hints.create_flow).toMatchObject({ readOnlyHint: false, destructiveHint: false });
        for (const name of ['manage_device', 'configure_device', 'assistant', 'terminate_device']) {
            expect(hints[name], name).toMatchObject({ readOnlyHint: false, destructiveHint: true });
        }
    } finally {
        await close();
    }
});
