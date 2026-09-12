import { AppError } from './errors';
import type { NextRequest } from 'next/server';

/**
 * In-memory fixed-window limiter. Deliberately simple: it protects a single
 * instance against accidental floods on write endpoints. A multi-instance
 * deployment would swap this for Redis/Upstash behind the same function
 * signature — that is why the call site only sees `enforceRateLimit()`.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function enforceRateLimit(
  req: NextRequest,
  { key, limit, windowSeconds }: { key: string; limit: number; windowSeconds: number },
) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const bucketKey = `${key}:${ip}`;
  const now = Date.now();
  const bucket = buckets.get(bucketKey);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + windowSeconds * 1000 });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    throw AppError.rateLimited(Math.ceil((bucket.resetAt - now) / 1000));
  }
}

export function requireAdmin(req: NextRequest) {
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) throw AppError.unauthorized('Admin API key is not configured on the server.');
  if (req.headers.get('x-api-key') !== expected) throw AppError.unauthorized();
}
