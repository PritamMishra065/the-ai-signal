import { createHash } from 'node:crypto';

/**
 * Canonical form used as the dedupe key for colleges. "I.I.T. Delhi",
 * "IIT  Delhi" and "iit delhi" all collapse to the same value, so the
 * unique index on `normalizedName` blocks duplicate ingestion.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function slugify(value: string): string {
  return normalizeName(value).replace(/ /g, '-');
}

/** We store a hash, never the raw email — enough to block repeat reviews. */
export function hashEmail(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

/**
 * Postgres `to_tsquery` throws on arbitrary user text, so we never hand it raw
 * input. Terms are stripped to [a-z0-9], joined with AND, and each gets a `:*`
 * prefix match so "iit d" still finds "IIT Delhi" while the user is typing.
 */
export function toPrefixTsQuery(input: string): string | null {
  const terms = input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .slice(0, 8);

  if (terms.length === 0) return null;
  return terms.map((t) => `${t}:*`).join(' & ');
}
