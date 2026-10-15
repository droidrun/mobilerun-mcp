function record(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

export async function awaitCheckoutUrl(
    original: unknown,
    idField: string,
    get: (id: string) => Promise<unknown>,
    waitMs = 1000,
    budgetMs = 5000,
): Promise<unknown> {
    const envelope = record(original);
    const data = record(envelope?.data) ?? envelope;
    if (!data || (data.state ?? data.status) !== 'awaiting_payment' || data.checkoutUrl !== null) return original;
    const id = data[idField];
    if (typeof id !== 'string') return original;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = Symbol('expired');
    const deadline = new Promise<typeof expired>((resolve) => {
        timer = setTimeout(() => resolve(expired), budgetMs);
    });
    try {
        for (let attempt = 0; attempt < 5; attempt++) {
            if ((await Promise.race([new Promise((resolve) => setTimeout(resolve, waitMs)), deadline])) === expired)
                break;
            const result = await Promise.race([get(id), deadline]);
            if (result === expired) break;
            const latest = record(result);
            const updated = record(latest?.data) ?? latest;
            if (typeof updated?.checkoutUrl === 'string' && updated.checkoutUrl) {
                const merged = { ...data, checkoutUrl: updated.checkoutUrl };
                return envelope?.data ? { ...envelope, data: merged } : merged;
            }
        }
    } catch {
        // Creation succeeded; a transient read failure must not invite another purchase.
    } finally {
        clearTimeout(timer);
    }
    return {
        ...envelope,
        note: 'Checkout URL is not ready yet; get will provide the URL shortly. Do not repeat create.',
    };
}
