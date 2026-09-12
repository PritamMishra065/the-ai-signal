/**
 * Admission-chance scoring.
 *
 * Kept as pure functions with no database or framework imports so the rules can
 * be unit-tested directly (see scoring.test.ts) and swapped for a data-driven
 * model later without touching the API layer.
 */

export const CHANCE_BUCKETS = ['SAFE', 'HIGH', 'MODERATE', 'AMBITIOUS'] as const;
export type ChanceBucket = (typeof CHANCE_BUCKETS)[number];

/** Below this probability a suggestion is noise, so it is dropped entirely. */
const MIN_PROBABILITY = 0.12;

/**
 * Steepness of the logistic curve. At k = 6:
 *   rank 30% better than the cutoff -> ~0.87    (comfortable)
 *   rank exactly at last year's cutoff -> 0.50  (a coin flip, which is honest:
 *                                                cutoffs move every year)
 *   rank 30% worse than the cutoff -> ~0.14     (a reach)
 */
const CURVE_STEEPNESS = 6;

export function admissionProbability(rank: number, expectedClosingRank: number): number {
  if (expectedClosingRank <= 0) return 0;
  const ratio = rank / expectedClosingRank;
  const probability = 1 / (1 + Math.exp(CURVE_STEEPNESS * (ratio - 1)));
  return Math.round(probability * 1000) / 1000;
}

export function toBucket(probability: number): ChanceBucket | null {
  if (probability >= 0.8) return 'SAFE';
  if (probability >= 0.6) return 'HIGH';
  if (probability >= 0.35) return 'MODERATE';
  if (probability >= MIN_PROBABILITY) return 'AMBITIOUS';
  return null;
}

export interface CutoffPoint {
  year: number;
  closingRank: number;
}

/**
 * Projects next year's closing rank from the historical series.
 *
 * Cutoffs drift year to year (seat expansion, exam difficulty, new campuses).
 * Using only last year's number makes every borderline prediction wrong in the
 * same direction. We take the average year-on-year percentage change, damp it
 * to 50% (a two-year sample is weak evidence) and clamp the total adjustment to
 * +/-20% so one anomalous year cannot produce an absurd projection.
 *
 * With a single data point there is no trend to read, so we return it unchanged.
 */
export function projectClosingRank(points: CutoffPoint[]): {
  expectedClosingRank: number;
  basedOnYear: number;
  trendPct: number;
} {
  if (points.length === 0) throw new Error('projectClosingRank requires at least one point');

  const sorted = [...points].sort((a, b) => a.year - b.year);
  const latest = sorted[sorted.length - 1]!;

  if (sorted.length === 1) {
    return { expectedClosingRank: latest.closingRank, basedOnYear: latest.year, trendPct: 0 };
  }

  const changes: number[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1]!;
    const current = sorted[i]!;
    if (previous.closingRank > 0) {
      changes.push((current.closingRank - previous.closingRank) / previous.closingRank);
    }
  }

  const averageChange = changes.reduce((sum, c) => sum + c, 0) / (changes.length || 1);
  const damped = clamp(averageChange * 0.5, -0.2, 0.2);

  return {
    expectedClosingRank: Math.max(1, Math.round(latest.closingRank * (1 + damped))),
    basedOnYear: latest.year,
    trendPct: Math.round(damped * 1000) / 10,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
