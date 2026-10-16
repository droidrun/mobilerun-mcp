import { describe, expect, test } from 'bun:test';
import { stableHash, rateLimitConfigFromPerMinute, TokenBucketLimiter } from '../rate-limit.js';

describe('TokenBucketLimiter', () => {
    test('allows up to capacity, then rejects with a positive Retry-After', () => {
        const limiter = new TokenBucketLimiter({ capacity: 3, refillPerSec: 0 });
        const now = 1_000_000;
        expect(limiter.consume('k', now).allowed).toBe(true);
        expect(limiter.consume('k', now).allowed).toBe(true);
        expect(limiter.consume('k', now).allowed).toBe(true);
        const fourth = limiter.consume('k', now);
        expect(fourth.allowed).toBe(false);
        expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    });

    test('refills over time', () => {
        const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSec: 1 });
        const t0 = 1_000_000;
        expect(limiter.consume('k', t0).allowed).toBe(true);
        expect(limiter.consume('k', t0).allowed).toBe(false);
        expect(limiter.consume('k', t0 + 1100).allowed).toBe(true);
    });

    test('separate keys have independent buckets', () => {
        const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSec: 0 });
        const now = 1_000_000;
        expect(limiter.consume('a', now).allowed).toBe(true);
        expect(limiter.consume('b', now).allowed).toBe(true);
        expect(limiter.consume('a', now).allowed).toBe(false);
    });
});

describe('stableHash', () => {
    test('is stable and never returns the raw credential', () => {
        const h1 = stableHash('dr_sk_secret');
        const h2 = stableHash('dr_sk_secret');
        expect(h1).toBe(h2);
        expect(h1).not.toContain('dr_sk_secret');
    });

    test('different credentials hash differently', () => {
        expect(stableHash('dr_sk_a')).not.toBe(stableHash('dr_sk_b'));
    });
});

describe('rateLimitConfigFromPerMinute', () => {
    test('derives capacity/refill from a per-minute limit', () => {
        expect(rateLimitConfigFromPerMinute(60)).toEqual({ capacity: 60, refillPerSec: 1 });
    });
});

test('bucket cardinality is capped and the least recently used key is evicted', () => {
    const limiter = new TokenBucketLimiter({ capacity: 1, refillPerSec: 0, maxBuckets: 2 });
    expect(limiter.consume('a', 0).allowed).toBe(true);
    expect(limiter.consume('b', 0).allowed).toBe(true);
    expect(limiter.consume('a', 0).allowed).toBe(false); // refresh recency
    expect(limiter.consume('c', 0).allowed).toBe(true); // evicts b
    expect(limiter.consume('a', 0).allowed).toBe(false);
    expect(limiter.consume('b', 0).allowed).toBe(true);
});
