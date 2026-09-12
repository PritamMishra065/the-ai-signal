import { Prisma } from '@prisma/client';
import { toPrefixTsQuery } from '@/lib/normalize';
import type { ListCollegesQuery, SortOption } from './schema';

/**
 * Builds the WHERE fragments for the college search.
 *
 * Everything is a parameterised `Prisma.Sql` fragment — user input never reaches
 * the query as text. The same fragments are reused by the rows query, the count
 * query and the facet queries, so a filter can never apply to one but not another.
 */
export function buildWhere(query: ListCollegesQuery): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  const tsQuery = query.q ? toPrefixTsQuery(query.q) : null;
  if (query.q && tsQuery) {
    // Full-text prefix match (GIN index) OR a trigram substring match, which
    // rescues queries the tokeniser splits badly, e.g. "bits-pilani".
    conditions.push(
      Prisma.sql`(
        to_tsvector('simple', c."searchText") @@ to_tsquery('simple', ${tsQuery})
        OR c."searchText" ILIKE ${'%' + query.q.toLowerCase() + '%'}
      )`,
    );
  }

  if (query.state) {
    conditions.push(Prisma.sql`lower(c."state") = ANY(${lowerAll(query.state)}::text[])`);
  }
  if (query.city) {
    conditions.push(Prisma.sql`lower(c."city") = ANY(${lowerAll(query.city)}::text[])`);
  }
  if (query.ownership) {
    conditions.push(Prisma.sql`c."ownership" = ANY(${query.ownership}::"Ownership"[])`);
  }
  if (query.minRating !== undefined) {
    conditions.push(Prisma.sql`c."ratingAvg" >= ${query.minRating}`);
  }
  if (query.maxNirfRank !== undefined) {
    conditions.push(Prisma.sql`c."nirfRank" IS NOT NULL AND c."nirfRank" <= ${query.maxNirfRank}`);
  }
  if (query.minMedianPackage !== undefined) {
    conditions.push(
      Prisma.sql`c."latestMedianPackageInr" IS NOT NULL AND c."latestMedianPackageInr" >= ${query.minMedianPackage}`,
    );
  }
  if (query.establishedAfter !== undefined) {
    conditions.push(Prisma.sql`c."establishedYear" >= ${query.establishedAfter}`);
  }

  const coursePredicate = buildCoursePredicate(query);
  if (coursePredicate) {
    conditions.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "Course" co WHERE co."collegeId" = c."id" AND ${coursePredicate})`,
    );
  }

  if (conditions.length === 0) return Prisma.sql`TRUE`;
  return Prisma.join(conditions, ' AND ');
}

/**
 * Stream / degree / fee filters are *course-level*, so they are combined into a
 * single EXISTS. This matters: `?stream=LAW&maxFee=200000` must mean "has a LAW
 * course under 2L", not "has a LAW course AND has some other cheap course".
 */
function buildCoursePredicate(query: ListCollegesQuery): Prisma.Sql | null {
  const parts: Prisma.Sql[] = [];

  if (query.stream) parts.push(Prisma.sql`co."stream" = ANY(${query.stream}::"Stream"[])`);
  if (query.degreeLevel) {
    parts.push(Prisma.sql`co."degreeLevel" = ANY(${query.degreeLevel}::"DegreeLevel"[])`);
  }
  if (query.minFee !== undefined) parts.push(Prisma.sql`co."annualFeeInr" >= ${query.minFee}`);
  if (query.maxFee !== undefined) parts.push(Prisma.sql`co."annualFeeInr" <= ${query.maxFee}`);

  if (parts.length === 0) return null;
  return Prisma.join(parts, ' AND ');
}

/**
 * Relevance score. Full-text rank alone ranks "Delhi Technological University"
 * above "IIT Delhi" for the query "delhi iit", so we layer deterministic boosts
 * for exact short-name and name-prefix hits, then use rating as a gentle
 * tie-breaker between otherwise equal matches.
 */
export function buildRelevanceExpr(q: string | undefined): Prisma.Sql {
  const tsQuery = q ? toPrefixTsQuery(q) : null;
  if (!q || !tsQuery) return Prisma.sql`0::float`;

  const lowered = q.toLowerCase();
  return Prisma.sql`(
    ts_rank(to_tsvector('simple', c."searchText"), to_tsquery('simple', ${tsQuery})) * 4
    + CASE WHEN lower(coalesce(c."shortName", '')) = ${lowered} THEN 3 ELSE 0 END
    + CASE WHEN lower(c."name") LIKE ${lowered + '%'} THEN 2 ELSE 0 END
    + (c."ratingAvg" / 10)::float
  )`;
}

/**
 * NULLS LAST everywhere: a college with no NIRF rank or no reported placement
 * must never outrank one that has the data. `id` is the final tie-breaker so
 * paging is stable — without it Postgres may reorder equal rows between pages.
 */
export function buildOrderBy(sort: SortOption): Prisma.Sql {
  switch (sort) {
    case 'relevance':
      return Prisma.sql`relevance DESC, c."nirfRank" ASC NULLS LAST, c."id" ASC`;
    case 'rating_desc':
      return Prisma.sql`c."ratingAvg" DESC, c."ratingCount" DESC, c."id" ASC`;
    case 'fees_asc':
      return Prisma.sql`c."minAnnualFeeInr" ASC NULLS LAST, c."id" ASC`;
    case 'fees_desc':
      return Prisma.sql`c."maxAnnualFeeInr" DESC NULLS LAST, c."id" ASC`;
    case 'placement_desc':
      return Prisma.sql`c."latestMedianPackageInr" DESC NULLS LAST, c."id" ASC`;
    case 'name_asc':
      return Prisma.sql`c."name" ASC, c."id" ASC`;
    case 'established_asc':
      return Prisma.sql`c."establishedYear" ASC, c."id" ASC`;
    case 'nirf_asc':
    default:
      return Prisma.sql`c."nirfRank" ASC NULLS LAST, c."ratingAvg" DESC, c."id" ASC`;
  }
}

function lowerAll(values: string[]): string[] {
  return values.map((v) => v.toLowerCase());
}
