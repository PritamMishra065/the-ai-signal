import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { toLakhs } from '@/modules/colleges/mappers';
import { admissionProbability, projectClosingRank, toBucket, type ChanceBucket } from './scoring';
import type { PredictRequest } from './schema';

interface CutoffRow {
  courseId: string;
  collegeId: string;
  year: number;
  closingRank: number;
  openingRank: number;
  quota: string;
  courseName: string;
  courseStream: string;
  degreeLevel: string;
  annualFeeInr: number;
  totalSeats: number;
  collegeSlug: string;
  collegeName: string;
  collegeCity: string;
  collegeState: string;
  nirfRank: number | null;
  ratingAvg: Prisma.Decimal;
  latestMedianPackageInr: number | null;
}

/**
 * A candidate is only worth scoring if their rank is within reach of the cutoff.
 * 0.65 is the inverse of the probability floor (a rank ~35% worse than the
 * projected cutoff already scores below the drop threshold), so this prefilter
 * removes rows the scorer would discard anyway — but it removes them in
 * Postgres, using the (examId, category, quota, closingRank) index, instead of
 * pulling every cutoff in the country into Node.
 */
const REACH_FACTOR = 0.65;

export async function predictColleges(input: PredictRequest) {
  const exam = await prisma.exam.findUnique({ where: { code: input.exam } });
  if (!exam) {
    const known = await prisma.exam.findMany({ select: { code: true }, orderBy: { code: 'asc' } });
    throw new AppError('NOT_FOUND', `Unknown exam '${input.exam}'.`, {
      supportedExams: known.map((e) => e.code),
    });
  }

  // A rank beyond the number of candidates who sat the exam is a typo, not a
  // valid query. Failing loudly beats returning an empty list they can't explain.
  if (input.rank > exam.maxRank) {
    throw AppError.badRequest(
      `Rank ${input.rank.toLocaleString('en-IN')} is beyond the highest rank issued for ${exam.code} (${exam.maxRank.toLocaleString('en-IN')}).`,
      { maxRank: exam.maxRank },
    );
  }

  const rows = await fetchCutoffSeries(exam.id, input);

  // One entry per course, holding its full year-by-year cutoff series.
  const byCourse = new Map<string, CutoffRow[]>();
  for (const row of rows) {
    const series = byCourse.get(row.courseId);
    if (series) series.push(row);
    else byCourse.set(row.courseId, [row]);
  }

  const matches: CourseMatch[] = [];
  for (const series of byCourse.values()) {
    const match = scoreCourse(series, input.rank);
    if (match) matches.push(match);
  }

  const colleges = groupByCollege(matches).slice(0, input.limit);

  return {
    query: {
      exam: exam.code,
      examName: exam.name,
      rank: input.rank,
      category: input.category,
      quota: input.quota,
      homeState: input.homeState ?? null,
      streams: input.streams ?? null,
    },
    summary: {
      totalColleges: colleges.length,
      byBucket: countBuckets(colleges),
    },
    results: colleges,
    disclaimer:
      'Predictions project last year’s closing ranks forward. Actual cutoffs move with seat matrices, exam difficulty and counselling rounds — treat these as guidance, not a guarantee.',
  };
}

function fetchCutoffSeries(examId: string, input: PredictRequest) {
  const quotaPredicate = buildQuotaPredicate(input);
  const streamPredicate = input.streams
    ? Prisma.sql`AND co."stream" = ANY(${input.streams}::"Stream"[])`
    : Prisma.empty;
  const reachThreshold = Math.floor(input.rank * REACH_FACTOR);

  return prisma.$queryRaw<CutoffRow[]>`
    WITH final_round AS (
      -- Counselling runs several rounds; the LAST round's closing rank is the
      -- real admission boundary, so we keep exactly one row per course per year.
      SELECT DISTINCT ON (cu."courseId", cu."year")
        cu."courseId", cu."collegeId", cu."year", cu."closingRank", cu."openingRank",
        cu."quota"::text AS quota
      FROM "Cutoff" cu
      JOIN "College" c ON c."id" = cu."collegeId"
      JOIN "Course" co ON co."id" = cu."courseId"
      WHERE cu."examId" = ${examId}
        AND cu."category" = ${input.category}::"Category"
        AND (${quotaPredicate})
        ${streamPredicate}
      ORDER BY cu."courseId", cu."year", cu."round" DESC
    ),
    latest AS (
      SELECT DISTINCT ON ("courseId") "courseId", "closingRank"
      FROM final_round ORDER BY "courseId", "year" DESC
    ),
    eligible AS (
      SELECT "courseId" FROM latest WHERE "closingRank" >= ${reachThreshold}
    )
    SELECT
      fr."courseId", fr."collegeId", fr."year", fr."closingRank", fr."openingRank", fr.quota,
      co."name" AS "courseName", co."stream"::text AS "courseStream",
      co."degreeLevel"::text AS "degreeLevel", co."annualFeeInr", co."totalSeats",
      c."slug" AS "collegeSlug", c."name" AS "collegeName", c."city" AS "collegeCity",
      c."state" AS "collegeState", c."nirfRank", c."ratingAvg", c."latestMedianPackageInr"
    FROM final_round fr
    JOIN eligible e ON e."courseId" = fr."courseId"
    JOIN "Course" co ON co."id" = fr."courseId"
    JOIN "College" c ON c."id" = fr."collegeId"
    ORDER BY fr."courseId", fr."year"
  `;
}

/**
 * Quota resolution, which is the subtle part of this feature.
 *
 * Home-state quota only exists at colleges inside the candidate's own state.
 * For every other college the same candidate competes under the all-India
 * quota. So a HOME_STATE request is not "filter to home-state rows" — it is
 * "use home-state rows where they apply, all-India rows everywhere else".
 */
function buildQuotaPredicate(input: PredictRequest): Prisma.Sql {
  if (input.quota === 'ALL_INDIA' || !input.homeState) {
    return Prisma.sql`cu."quota" = 'ALL_INDIA'::"Quota"`;
  }
  const homeState = input.homeState.toLowerCase();
  return Prisma.sql`(
    (cu."quota" = 'HOME_STATE'::"Quota" AND lower(c."state") = ${homeState})
    OR (cu."quota" = 'ALL_INDIA'::"Quota" AND lower(c."state") <> ${homeState})
  )`;
}

interface CourseMatch {
  collegeId: string;
  probability: number;
  bucket: ChanceBucket;
  college: {
    slug: string;
    name: string;
    city: string;
    state: string;
    nirfRank: number | null;
    rating: number;
    medianPackageLakhs: number | null;
  };
  course: {
    id: string;
    name: string;
    stream: string;
    degreeLevel: string;
    annualFeeInr: number;
    totalSeats: number;
  };
  cutoff: {
    quota: string;
    basedOnYear: number;
    lastClosingRank: number;
    expectedClosingRank: number;
    trendPct: number;
    yearsOfData: number;
  };
}

function scoreCourse(series: CutoffRow[], rank: number): CourseMatch | null {
  const latest = series.reduce((acc, row) => (row.year > acc.year ? row : acc), series[0]!);
  const projection = projectClosingRank(series.map((r) => ({ year: r.year, closingRank: r.closingRank })));

  const probability = admissionProbability(rank, projection.expectedClosingRank);
  const bucket = toBucket(probability);
  if (!bucket) return null;

  return {
    collegeId: latest.collegeId,
    probability,
    bucket,
    college: {
      slug: latest.collegeSlug,
      name: latest.collegeName,
      city: latest.collegeCity,
      state: latest.collegeState,
      nirfRank: latest.nirfRank,
      rating: Number(latest.ratingAvg),
      medianPackageLakhs: toLakhs(latest.latestMedianPackageInr),
    },
    course: {
      id: latest.courseId,
      name: latest.courseName,
      stream: latest.courseStream,
      degreeLevel: latest.degreeLevel,
      annualFeeInr: latest.annualFeeInr,
      totalSeats: latest.totalSeats,
    },
    cutoff: {
      quota: latest.quota,
      basedOnYear: projection.basedOnYear,
      lastClosingRank: latest.closingRank,
      expectedClosingRank: projection.expectedClosingRank,
      trendPct: projection.trendPct,
      yearsOfData: series.length,
    },
  };
}

interface CollegePrediction {
  college: CourseMatch['college'];
  bestChance: { probability: number; bucket: ChanceBucket };
  courses: {
    name: string;
    stream: string;
    degreeLevel: string;
    annualFeeInr: number;
    totalSeats: number;
    probability: number;
    bucket: ChanceBucket;
    cutoff: CourseMatch['cutoff'];
  }[];
}

/**
 * A college with eight qualifying branches should occupy one row, not eight.
 * We collapse to the college, keep every matching course nested and sorted, and
 * rank colleges by their best branch — then by NIRF, so two equally likely
 * options appear in the order a student would actually prefer them.
 */
function groupByCollege(matches: CourseMatch[]): CollegePrediction[] {
  const byCollege = new Map<string, CourseMatch[]>();
  for (const match of matches) {
    const list = byCollege.get(match.collegeId);
    if (list) list.push(match);
    else byCollege.set(match.collegeId, [match]);
  }

  const predictions: CollegePrediction[] = [];
  for (const group of byCollege.values()) {
    const sorted = [...group].sort((a, b) => b.probability - a.probability);
    const best = sorted[0]!;
    predictions.push({
      college: best.college,
      bestChance: { probability: best.probability, bucket: best.bucket },
      courses: sorted.map((m) => ({
        name: m.course.name,
        stream: m.course.stream,
        degreeLevel: m.course.degreeLevel,
        annualFeeInr: m.course.annualFeeInr,
        totalSeats: m.course.totalSeats,
        probability: m.probability,
        bucket: m.bucket,
        cutoff: m.cutoff,
      })),
    });
  }

  return predictions.sort((a, b) => {
    if (b.bestChance.probability !== a.bestChance.probability) {
      return b.bestChance.probability - a.bestChance.probability;
    }
    return (a.college.nirfRank ?? Number.MAX_SAFE_INTEGER) - (b.college.nirfRank ?? Number.MAX_SAFE_INTEGER);
  });
}

function countBuckets(predictions: CollegePrediction[]): Record<ChanceBucket, number> {
  const counts: Record<ChanceBucket, number> = { SAFE: 0, HIGH: 0, MODERATE: 0, AMBITIOUS: 0 };
  for (const prediction of predictions) counts[prediction.bestChance.bucket] += 1;
  return counts;
}
