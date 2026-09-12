import { NextResponse } from 'next/server';
import type { ErrorCode } from './errors';

export interface ResponseMeta {
  requestId: string;
  durationMs: number;
}

export interface SuccessBody<T> {
  data: T;
  meta: ResponseMeta & Record<string, unknown>;
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown };
  meta: ResponseMeta;
}

interface JsonOptions {
  status?: number;
  headers?: Record<string, string>;
}

export function json<T>(body: T, options: JsonOptions = {}) {
  return NextResponse.json(body, {
    status: options.status ?? 200,
    headers: { 'content-type': 'application/json; charset=utf-8', ...options.headers },
  });
}
