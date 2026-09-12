import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { buildOrderBy, buildRelevanceExpr, buildWhere } from './filters';
import type { ListCollegesQuery } from './schema';

export interface CollegeCardRow {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  city: string;
  state: string;
  ownership: string;
  establishedYear: number;
  nirfRank: number | null;
  naacGrade: string | null;
  ratingAvg: Prisma.Decimal;
  ratingCount: number;
  courseCount: number;
  minAnnualFeeInr: number | null;
  maxAnnualFeeInr: number | null;
  latestMedianPackageInr: number | null;
  latestPlacementRate: Prisma.Decimal | null;
  relevance: number;
}

export interface FacetBucket {
  value: string;
  count: number;
}

export interface Facets {
  state: FacetBucket[];
  ownership: FacetBucket[];
  stream: FacetBucket[];
}

const CARD_COLUMNS = Prisma.sql`
  c."id", c."slug", c."name", c."shortName", c."city", c."state",
  c."ownership"::text AS "ownership", c."establishedYear", c."nirfRank", c."naacGrade",
  c."ratingAvg", c."ratingCount", c."courseCount",
  c."minAnnualFeeInr", c."maxAnnualFeeInr",
  c."latestMedianPackageInr", c."latestPlacementRate"
`;

export async function queryColleges(query: ListCollegesQuery, limit: number, offset: number) {
  const where = buildWhere(query);
  const relevance = buildRelevanceExpr(query.q);
  const orderBy = buildOrderBy(query.sort ?? (query.q ? 'relevance' : 'nirf_asc'));

  // Rows and the total are independent queries; running them concurrently on the
  // same pool halves the wall-clock cost of a page.
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<CollegeCardRow[]>`
      SELECT ${CARD_COLUMNS}, ${relevance} AS relevance
      FROM "College" c
      WHERE ${where}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `,
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*)::bigint AS count FROM "College" c WHERE ${where}
    `,
  ]);

  return { rows, total: Number(countRows[0]?.count ?? 0) };
}

/**
 * Facet counts for the current filter set, so the UI can grey out or annotate
 * options instead of letting users select a filter that returns nothing.
 * Opt-in (`?facets=true`) because it costs three extra aggregations.
 */
export async function queryFacets(query: ListCollegesQuery): Promise<Facets> {
  const where = buildWhere(query);

  const [state, ownership, stream] = await Promise.all([
    prisma.$queryRaw<{ value: string; count: bigint }[]>`
      SELECT c."state" AS value, count(*)::bigint AS count
      FROM "College" c WHERE ${where}
      GROUP BY c."state" ORDER BY count DESC, value ASC LIMIT 40
    `,
    prisma.$queryRaw<{ value: string; count: bigint }[]>`
      SELECT c."ownership"::text AS value, count(*)::bigint AS count
      FROM "College" c WHERE ${where}
      GROUP BY c."ownership" ORDER BY count DESC, value ASC
    `,
    prisma.$queryRaw<{ value: string; count: bigint }[]>`
      SELECT co."stream"::text AS value, count(DISTINCT c."id")::bigint AS count
      FROM "College" c
      JOIN "Course" co ON co."collegeId" = c."id"
      WHERE ${where}
      GROUP BY co."stream" ORDER BY count DESC, value ASC
    `,
  ]);

  const toBuckets = (rows: { value: string; count: bigint }[]): FacetBucket[] =>
    rows.map((r) => ({ value: r.value, count: Number(r.count) }));

  return { state: toBuckets(state), ownership: toBuckets(ownership), stream: toBuckets(stream) };
}

/** Everything the detail page needs, in one round trip. */
export function findCollegeBySlug(slug: string) {
  return prisma.college.findUnique({
    where: { slug },
    include: {
      courses: { orderBy: [{ degreeLevel: 'asc' }, { annualFeeInr: 'asc' }] },
      placements: { orderBy: { year: 'desc' }, take: 5 },
      reviews: {
        where: { status: 'PUBLISHED' },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });
}

export function findCollegesForCompare(slugs: string[]) {
  return prisma.college.findMany({
    where: { slug: { in: slugs } },
    include: {
      courses: { orderBy: { annualFeeInr: 'asc' } },
      placements: { orderBy: { year: 'desc' }, take: 1 },
    },
  });
}
