// Simple in-process token-bucket rate limiter. Deliberately not
// distributed/shared across replicas — that's explicitly deferred to a
// deployment-layer concern; this is the floor every single instance
// enforces regardless of what a distributed limiter later adds on top.
import { createHash } from 'node:crypto';

export interface RateLimitConfig {
    /** Max tokens (burst size). */
    capacity: number;
    /** Tokens added per second. */
    refillPerSec: number;
}

interface Bucket {
    tokens: number;
    lastRefillMs: number;
    lastSeenMs: number;
}

export interface RateLimitResult {
    allowed: boolean;
    /** Seconds to wait before the next token would be available. 0 when allowed. */
    retryAfterSeconds: number;
}

// Buckets idle longer than this are swept out on a probabilistic pass so
// the map doesn't grow unbounded with one-shot callers (e.g. random IPs).
const BUCKET_IDLE_TTL_MS = 60 * 60 * 1000; // 1h
const SWEEP_EVERY_N_CALLS = 500;

export class TokenBucketLimiter {
    private readonly buckets = new Map<string, Bucket>();
    private callCount = 0;

    constructor(private readonly config: RateLimitConfig) {}

    consume(key: string, now = Date.now()): RateLimitResult {
        this.callCount++;
        if (this.callCount % SWEEP_EVERY_N_CALLS === 0) this.sweep(now);

        let bucket = this.buckets.get(key);
        if (!bucket) {
            bucket = { tokens: this.config.capacity, lastRefillMs: now, lastSeenMs: now };
            this.buckets.set(key, bucket);
        }

        const elapsedSec = Math.max(0, (now - bucket.lastRefillMs) / 1000);
        bucket.tokens = Math.min(this.config.capacity, bucket.tokens + elapsedSec * this.config.refillPerSec);
        bucket.lastRefillMs = now;
        bucket.lastSeenMs = now;

        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            return { allowed: true, retryAfterSeconds: 0 };
        }
        const deficit = 1 - bucket.tokens;
        const retryAfterSeconds = Math.max(1, Math.ceil(deficit / this.config.refillPerSec));
        return { allowed: false, retryAfterSeconds };
    }

    private sweep(now: number): void {
        for (const [key, bucket] of this.buckets) {
            if (now - bucket.lastSeenMs > BUCKET_IDLE_TTL_MS) this.buckets.delete(key);
        }
    }
}

/** Stable, non-reversible bucket key for a credential — never store/log the raw key. */
export function hashCredential(credential: string): string {
    return createHash('sha256').update(credential).digest('hex').slice(0, 32);
}

export function rateLimitConfigFromPerMinute(limitPerMinute: number): RateLimitConfig {
    return { capacity: limitPerMinute, refillPerSec: limitPerMinute / 60 };
}
