import { AppError } from '@/lib/http/errors';
import { decimalToNumber, toCollegeCard, toLakhs } from './mappers';
import {
  findCollegeBySlug,
  findCollegesForCompare,
  queryColleges,
  queryFacets,
} from './repository';
import type { ListCollegesQuery } from './schema';

const DEFAULT_PAGE_SIZE = 20;

export async function listColleges(query: ListCollegesQuery) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * pageSize;

  const { rows, total } = await queryColleges(query, pageSize, offset);
  const facets = query.facets ? await queryFacets(query) : undefined;

  return {
    data: rows.map(toCollegeCard),
    meta: {
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
        hasNextPage: offset + rows.length < total,
      },
      appliedSort: query.sort ?? (query.q ? 'relevance' : 'nirf_asc'),
      ...(facets ? { facets } : {}),
    },
  };
}

export async function getCollegeDetail(slug: string) {
  const college = await findCollegeBySlug(slug);
  if (!college) throw AppError.notFound('College', slug);

  const latestPlacement = college.placements[0] ?? null;

  return {
    id: college.id,
    slug: college.slug,
    name: college.name,
    shortName: college.shortName,
    overview: {
      description: college.description,
      location: { city: college.city, state: college.state },
      ownership: college.ownership,
      establishedYear: college.establishedYear,
      campusAreaAcres: college.campusAreaAcres,
      website: college.website,
      naacGrade: college.naacGrade,
      nirfRank: college.nirfRank,
      approvedBy: college.approvedBy,
    },
    rating: {
      average: decimalToNumber(college.ratingAvg) ?? 0,
      count: college.ratingCount,
      breakdown: buildRatingBreakdown(college.reviews),
    },
    fees: {
      minAnnualInr: college.minAnnualFeeInr,
      maxAnnualInr: college.maxAnnualFeeInr,
    },
    courses: college.courses.map((course) => ({
      id: course.id,
      slug: course.slug,
      name: course.name,
      degreeLevel: course.degreeLevel,
      stream: course.stream,
      durationMonths: course.durationMonths,
      annualFeeInr: course.annualFeeInr,
      totalFeeInr: Math.round((course.annualFeeInr * course.durationMonths) / 12),
      totalSeats: course.totalSeats,
    })),
    placements: {
      latest: latestPlacement
        ? {
            year: latestPlacement.year,
            medianPackageInr: latestPlacement.medianPackageInr,
            medianPackageLakhs: toLakhs(latestPlacement.medianPackageInr),
            averagePackageInr: latestPlacement.averagePackageInr,
            highestPackageInr: latestPlacement.highestPackageInr,
            placementRatePct: decimalToNumber(latestPlacement.placementRatePct),
            studentsPlaced: latestPlacement.studentsPlaced,
            topRecruiters: latestPlacement.topRecruiters,
          }
        : null,
      // Oldest-first so a client can plot the trend without re-sorting.
      history: [...college.placements]
        .sort((a, b) => a.year - b.year)
        .map((p) => ({
          year: p.year,
          medianPackageInr: p.medianPackageInr,
          placementRatePct: decimalToNumber(p.placementRatePct),
        })),
    },
    reviews: college.reviews.map((review) => ({
      id: review.id,
      authorName: review.authorName,
      title: review.title,
      body: review.body,
      graduationYear: review.graduationYear,
      ratings: {
        overall: review.overallRating,
        academics: review.academicsRating,
        infrastructure: review.infrastructureRating,
        placements: review.placementsRating,
        faculty: review.facultyRating,
      },
      createdAt: review.createdAt.toISOString(),
    })),
  };
}

interface ReviewFacets {
  academicsRating: number;
  infrastructureRating: number;
  placementsRating: number;
  facultyRating: number;
}

function buildRatingBreakdown(reviews: ReviewFacets[]) {
  if (reviews.length === 0) {
    return { academics: null, infrastructure: null, placements: null, faculty: null };
  }
  const avg = (pick: (r: ReviewFacets) => number) =>
    Math.round((reviews.reduce((sum, r) => sum + pick(r), 0) / reviews.length) * 10) / 10;

  return {
    academics: avg((r) => r.academicsRating),
    infrastructure: avg((r) => r.infrastructureRating),
    placements: avg((r) => r.placementsRating),
    faculty: avg((r) => r.facultyRating),
  };
}

type Unit = 'INR' | 'LPA' | 'RATING' | 'PERCENT' | 'RANK' | 'YEAR' | 'COUNT' | 'TEXT';

export interface CompareDimension {
  key: string;
  label: string;
  unit: Unit;
  /** null = not comparable (e.g. location), so the client renders no winner badge. */
  betterWhen: 'higher' | 'lower' | null;
  values: { slug: string; value: number | string | null }[];
  /** May hold several slugs on a tie, or none when nobody reported the metric. */
  bestSlugs: string[];
}

/**
 * The comparison is computed server-side and returned as a generic dimension
 * matrix. The client renders rows without knowing what "better" means for each
 * metric — adding a dimension later needs no frontend change.
 */
export async function compareColleges(slugs: string[]) {
  const colleges = await findCollegesForCompare(slugs);

  const found = new Map(colleges.map((c) => [c.slug, c]));
  const missing = slugs.filter((slug) => !found.has(slug));
  if (missing.length > 0) {
    throw new AppError('NOT_FOUND', `Unknown college slug(s): ${missing.join(', ')}.`, {
      missingSlugs: missing,
    });
  }

  // Preserve the caller's column order rather than the database's.
  const ordered = slugs.map((slug) => found.get(slug)!);

  const dimensions: CompareDimension[] = [
    dimension('location', 'Location', 'TEXT', null, ordered, (c) => `${c.city}, ${c.state}`),
    dimension('ownership', 'Ownership', 'TEXT', null, ordered, (c) => c.ownership),
    dimension('establishedYear', 'Established', 'YEAR', null, ordered, (c) => c.establishedYear),
    dimension('nirfRank', 'NIRF rank', 'RANK', 'lower', ordered, (c) => c.nirfRank),
    dimension('rating', 'Student rating', 'RATING', 'higher', ordered, (c) =>
      decimalToNumber(c.ratingAvg),
    ),
    dimension('ratingCount', 'Reviews', 'COUNT', 'higher', ordered, (c) => c.ratingCount),
    dimension('minAnnualFee', 'Lowest annual fee', 'INR', 'lower', ordered, (c) => c.minAnnualFeeInr),
    dimension('maxAnnualFee', 'Highest annual fee', 'INR', 'lower', ordered, (c) => c.maxAnnualFeeInr),
    dimension('medianPackage', 'Median package (LPA)', 'LPA', 'higher', ordered, (c) =>
      toLakhs(c.placements[0]?.medianPackageInr ?? null),
    ),
    dimension('highestPackage', 'Highest package (LPA)', 'LPA', 'higher', ordered, (c) =>
      toLakhs(c.placements[0]?.highestPackageInr ?? null),
    ),
    dimension('placementRate', 'Placement rate', 'PERCENT', 'higher', ordered, (c) =>
      decimalToNumber(c.placements[0]?.placementRatePct ?? null),
    ),
    dimension('courseCount', 'Courses offered', 'COUNT', 'higher', ordered, (c) => c.courses.length),
  ];

  return {
    colleges: ordered.map((c) => ({
      slug: c.slug,
      name: c.name,
      shortName: c.shortName,
      location: { city: c.city, state: c.state },
    })),
    dimensions,
    // Count of dimensions each college outright wins — a headline for the UI.
    summary: ordered.map((c) => ({
      slug: c.slug,
      wins: dimensions.filter((d) => d.bestSlugs.length === 1 && d.bestSlugs[0] === c.slug).length,
    })),
  };
}

function dimension<T extends { slug: string }>(
  key: string,
  label: string,
  unit: Unit,
  betterWhen: 'higher' | 'lower' | null,
  colleges: T[],
  pick: (college: T) => number | string | null,
): CompareDimension {
  const values = colleges.map((c) => ({ slug: c.slug, value: pick(c) }));

  let bestSlugs: string[] = [];
  if (betterWhen) {
    const numeric = values.filter(
      (v): v is { slug: string; value: number } => typeof v.value === 'number',
    );
    // A "win" over a single reported value is meaningless — require a contest.
    if (numeric.length > 1) {
      const best = numeric.reduce(
        (acc, v) => (betterWhen === 'higher' ? Math.max(acc, v.value) : Math.min(acc, v.value)),
        numeric[0]!.value,
      );
      bestSlugs = numeric.filter((v) => v.value === best).map((v) => v.slug);
    }
  }

  return { key, label, unit, betterWhen, values, bestSlugs };
}
