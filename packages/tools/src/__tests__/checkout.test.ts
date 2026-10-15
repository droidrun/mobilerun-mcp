import { expect, test } from 'bun:test';
import { awaitCheckoutUrl } from '../tools/checkout.js';

test('checkout retries are capped and retain the purchase with a get hint', async () => {
    let calls = 0;
    const original = { data: { numberId: 'n1', state: 'awaiting_payment', checkoutUrl: null } };
    const result = await awaitCheckoutUrl(
        original,
        'numberId',
        async () => {
            calls++;
            return { data: { checkoutUrl: null } };
        },
        1,
        100,
    );
    expect(calls).toBe(5);
    expect(result).toMatchObject({ ...original, note: expect.stringContaining('get will provide the URL shortly') });
});

test('a stalled or failed get cannot hide a successful purchase', async () => {
    const original = { data: { numberId: 'n1', state: 'awaiting_payment', checkoutUrl: null } };
    const started = Date.now();
    const result = await awaitCheckoutUrl(original, 'numberId', () => new Promise(() => {}), 1, 20);
    expect(Date.now() - started).toBeLessThan(500);
    expect(result).toMatchObject({ ...original, note: expect.stringContaining('Do not repeat create') });
    expect(
        await awaitCheckoutUrl(
            original,
            'numberId',
            async () => {
                throw new Error('temporary');
            },
            1,
            100,
        ),
    ).toMatchObject({ ...original, note: expect.any(String) });
});

test('ready or non-payment purchases never poll', async () => {
    for (const data of [
        { numberId: 'n1', state: 'provisioning', checkoutUrl: null },
        { numberId: 'n1', state: 'awaiting_payment', checkoutUrl: 'https://example.com/checkout' },
    ]) {
        const original = { data };
        expect(
            await awaitCheckoutUrl(original, 'numberId', async () => {
                throw new Error('unexpected get');
            }),
        ).toBe(original);
    }
});
