import type { Prisma } from '@prisma/client';

/**
 * Recomputes every denormalised column on a College from its own rows.
 *
 * Why recompute rather than increment: an incremental update ("ratingAvg =
 * (ratingAvg * n + new) / (n+1)") drifts on retries and cannot repair itself
 * after a moderation change or a deletion. A full recompute is idempotent, and
 * a college has tens of rows, not millions — so it is cheap enough to always be
 * correct. Callers MUST pass the transaction client of the write that caused
 * the invalidation, so the aggregate can never disagree with the source rows.
 */
export async function recomputeCollegeAggregates(
  tx: Prisma.TransactionClient,
  collegeId: string,
): Promise<void> {
  const college = await tx.college.findUnique({
    where: { id: collegeId },
    select: { id: true, name: true, shortName: true, city: true, state: true },
  });
  if (!college) return;

  const [reviewAgg, courseAgg, streams, latestPlacement] = await Promise.all([
    tx.review.aggregate({
      where: { collegeId, status: 'PUBLISHED' },
      _avg: { overallRating: true },
      _count: { _all: true },
    }),
    tx.course.aggregate({
      where: { collegeId },
      _min: { annualFeeInr: true },
      _max: { annualFeeInr: true },
      _count: { _all: true },
    }),
    tx.course.findMany({
      where: { collegeId },
      select: { stream: true },
      distinct: ['stream'],
    }),
    tx.placementStat.findFirst({
      where: { collegeId },
      orderBy: { year: 'desc' },
      select: { medianPackageInr: true, placementRatePct: true },
    }),
  ]);

  const ratingCount = reviewAgg._count._all;
  const ratingAvg = ratingCount > 0 ? (reviewAgg._avg.overallRating ?? 0) : 0;

  await tx.college.update({
    where: { id: collegeId },
    data: {
      ratingAvg: round2(ratingAvg),
      ratingCount,
      courseCount: courseAgg._count._all,
      minAnnualFeeInr: courseAgg._min.annualFeeInr,
      maxAnnualFeeInr: courseAgg._max.annualFeeInr,
      latestMedianPackageInr: latestPlacement?.medianPackageInr ?? null,
      latestPlacementRate: latestPlacement?.placementRatePct ?? null,
      searchText: buildSearchText({
        name: college.name,
        shortName: college.shortName,
        city: college.city,
        state: college.state,
        streams: streams.map((s) => s.stream),
      }),
    },
  });
}

/**
 * The haystack the search index is built over. Kept lower-cased and
 * punctuation-free so `to_tsvector('simple', ...)` and the trigram fallback
 * both see the same normalised text.
 */
export function buildSearchText(input: {
  name: string;
  shortName: string | null;
  city: string;
  state: string;
  streams: string[];
}): string {
  return [input.name, input.shortName ?? '', input.city, input.state, ...input.streams]
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
