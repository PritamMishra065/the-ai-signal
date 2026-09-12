import { z } from 'zod';

/**
 * Query strings are always `string | undefined`. These helpers coerce *explicitly*
 * and fail loudly on garbage ("?minFee=cheap" is a 422, never a silent 0).
 */

export const intParam = (opts: { min?: number; max?: number } = {}) =>
  z
    .string()
    .trim()
    .regex(/^-?\d+$/, 'must be a whole number')
    .transform(Number)
    .pipe(z.number().int().min(opts.min ?? Number.MIN_SAFE_INTEGER).max(opts.max ?? Number.MAX_SAFE_INTEGER));

export const floatParam = (opts: { min?: number; max?: number } = {}) =>
  z
    .string()
    .trim()
    .regex(/^-?\d+(\.\d+)?$/, 'must be a number')
    .transform(Number)
    .pipe(z.number().min(opts.min ?? -Infinity).max(opts.max ?? Infinity));

export const boolParam = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(['true', 'false', '1', '0']))
  .transform((v) => v === 'true' || v === '1');

/** `?state=Delhi,Karnataka` -> ['Delhi','Karnataka'], de-duplicated and capped. */
export const csvParam = (max = 20) =>
  z
    .string()
    .transform((raw) => [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))])
    .pipe(z.array(z.string().min(1).max(80)).min(1).max(max));

/** Same, but every item must be a member of the enum — so we never build bad SQL. */
export const csvEnumParam = <T extends readonly [string, ...string[]]>(values: T, max = 20) =>
  z
    .string()
    .transform((raw) => [...new Set(raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean))])
    .pipe(z.array(z.enum(values)).min(1).max(max));

/**
 * Parses `URLSearchParams` into a plain object before handing it to Zod.
 * Unknown params are rejected rather than ignored: a typo like `?statee=Delhi`
 * silently returning every college is worse than a 422.
 */
export function parseQuery<S extends z.ZodTypeAny>(schema: S, searchParams: URLSearchParams): z.infer<S> {
  const raw: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    if (value !== '') raw[key] = value;
  }
  return schema.parse(raw);
}
