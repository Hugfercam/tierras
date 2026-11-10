import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  key?: (req: Request) => string;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  private readonly windowMs: number;
  private readonly max: number;

  constructor(windowMs: number, max: number) {
    this.windowMs = windowMs;
    this.max = max;
  }

  take(key: string): { allowed: boolean; retryAfter: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      this.cleanup(now);
      return { allowed: true, retryAfter: 0 };
    }
    bucket.count += 1;
    if (bucket.count > this.max) {
      return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    return { allowed: true, retryAfter: 0 };
  }

  private cleanup(now: number): void {
    if (this.buckets.size < 500) return;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

export function rateLimit(options: RateLimitOptions) {
  const limiter = new RateLimiter(options.windowMs, options.max);
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = options.key?.(req) ?? req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const result = limiter.take(key);
    if (!result.allowed) {
      res.setHeader('Retry-After', String(result.retryAfter));
      res.status(429).json({
        error: options.message ?? 'Demasiados intentos. Espera un momento y prueba de nuevo.',
        code: 'RATE_LIMITED',
        retryAfter: result.retryAfter,
      });
      return;
    }
    next();
  };
}

export function emailKey(req: Request): string {
  const email =
    typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : 'sin-email';
  return `${req.ip ?? req.socket.remoteAddress ?? 'unknown'}:${email}`;
}
