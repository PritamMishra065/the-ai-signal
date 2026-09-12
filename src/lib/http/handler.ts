import { NextRequest } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, ErrorCode } from './errors';
import { json, type ErrorBody, type SuccessBody } from './response';

export interface RouteContext<P> {
  params: P;
  requestId: string;
  searchParams: URLSearchParams;
}

export interface RouteResult<T> {
  data: T;
  /** merged into the response `meta` object */
  meta?: Record<string, unknown>;
  status?: number;
  headers?: Record<string, string>;
}

type Handler<T, P> = (req: NextRequest, ctx: RouteContext<P>) => Promise<RouteResult<T>>;

interface RouteOptions {
  /** seconds; adds Cache-Control for CDN edge caching on read endpoints */
  cacheSeconds?: number;
}

/**
 * Wraps a route handler with the cross-cutting concerns every endpoint needs:
 * request id, timing, a single response envelope, and one place that turns
 * thrown errors into documented HTTP status codes. Route files stay pure logic.
 */
export function route<T, P = Record<string, never>>(
  handler: Handler<T, P>,
  options: RouteOptions = {},
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID();
    const startedAt = performance.now();

    try {
      const params = (await ctx.params) as P;
      const result = await handler(req, {
        params,
        requestId,
        searchParams: req.nextUrl.searchParams,
      });

      const body: SuccessBody<T> = {
        data: result.data,
        meta: {
          requestId,
          durationMs: round(performance.now() - startedAt),
          ...result.meta,
        },
      };

      const headers: Record<string, string> = { 'x-request-id': requestId, ...result.headers };
      if (options.cacheSeconds && req.method === 'GET') {
        headers['cache-control'] =
          `public, s-maxage=${options.cacheSeconds}, stale-while-revalidate=${options.cacheSeconds * 5}`;
      }

      return json(body, { status: result.status ?? 200, headers });
    } catch (error) {
      const appError = toAppError(error);

      if (appError.status >= 500) {
        console.error(`[${requestId}] ${req.method} ${req.nextUrl.pathname}`, error);
      }

      const body: ErrorBody = {
        error: { code: appError.code, message: appError.message, details: appError.details },
        meta: { requestId, durationMs: round(performance.now() - startedAt) },
      };

      const headers: Record<string, string> = { 'x-request-id': requestId };
      if (appError.code === ErrorCode.RATE_LIMITED) {
        const retry = (appError.details as { retryAfterSeconds?: number })?.retryAfterSeconds;
        if (retry) headers['retry-after'] = String(retry);
      }

      return json(body, { status: appError.status, headers });
    }
  };
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

/** Normalises every error source into the one shape the envelope understands. */
function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof ZodError) {
    return new AppError(
      ErrorCode.VALIDATION_ERROR,
      'The request failed validation.',
      error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        code: issue.code,
        message: issue.message,
      })),
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return AppError.conflict('A record with these unique values already exists.', {
          fields: (error.meta?.target as string[]) ?? undefined,
        });
      case 'P2025':
        return AppError.notFound('Record');
      case 'P2003':
        return AppError.badRequest('A referenced record does not exist.');
      default:
        break;
    }
  }

  if (error instanceof SyntaxError) {
    return AppError.badRequest('Request body must be valid JSON.');
  }

  return new AppError(ErrorCode.INTERNAL_ERROR, 'Something went wrong on our side.');
}
