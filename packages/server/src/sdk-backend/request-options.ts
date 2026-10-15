export function idempotencyOpts(key?: string) {
    return key ? { headers: { 'Idempotency-Key': key } } : {};
}
