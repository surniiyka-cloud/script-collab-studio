/**
 * Lightweight local auth throttle. Suitable for a single-process development server.
 * Production deployments with multiple replicas should use a shared Redis or gateway limit.
 */
export type LimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export class FixedWindowLimiter {
  private readonly buckets = new Map<string, { hits: number; resetAt: number }>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private readonly maxKeys: number;

  constructor(
    maxRequests: number,
    windowMs: number,
    now: () => number = Date.now,
    maxKeys = 20000,
  ) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.now = now;
    this.maxKeys = maxKeys;
    if (!Number.isInteger(maxRequests) || maxRequests < 1) throw new Error('maxRequests must be positive');
    if (!Number.isInteger(windowMs) || windowMs < 1000) throw new Error('windowMs must be >= 1000');
  }

  check(key: string): LimitDecision {
    const time = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || time >= bucket.resetAt) {
      if (!bucket && this.buckets.size >= this.maxKeys) {
        // Expired keys are deleted first; if saturated, fail closed, not open.
        for (const [k, value] of this.buckets) {
          if (time >= value.resetAt) this.buckets.delete(k);
        }
        if (this.buckets.size >= this.maxKeys) {
          return { allowed: false, retryAfterSeconds: Math.ceil(this.windowMs / 1000) };
        }
      }
      bucket = { hits: 0, resetAt: time + this.windowMs };
      this.buckets.set(key, bucket);
    }
    if (bucket.hits >= this.maxRequests) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - time) / 1000)) };
    }
    bucket.hits += 1;
    return { allowed: true };
  }
}

export type StudioRole = 'OWNER' | 'EDITOR' | 'VIEWER';
export function canEdit(role: StudioRole): boolean {
  return role === 'OWNER' || role === 'EDITOR';
}
