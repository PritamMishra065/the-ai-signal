import { z } from 'zod';
import { boolParam, csvEnumParam, csvParam, floatParam, intParam } from '@/lib/validation/common';

export const OWNERSHIPS = ['GOVERNMENT', 'PRIVATE', 'DEEMED', 'AUTONOMOUS'] as const;
export const STREAMS = [
  'ENGINEERING',
  'MEDICAL',
  'MANAGEMENT',
  'LAW',
  'DESIGN',
  'SCIENCE',
  'COMMERCE',
  'ARTS',
] as const;
export const DEGREE_LEVELS = ['DIPLOMA', 'UNDERGRADUATE', 'POSTGRADUATE', 'DOCTORATE'] as const;

export const SORT_OPTIONS = [
  'relevance',
  'rating_desc',
  'fees_asc',
  'fees_desc',
  'nirf_asc',
  'placement_desc',
  'name_asc',
  'established_asc',
] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const MAX_PAGE_SIZE = 50;
/** Deep offsets make Postgres scan-and-throw-away. See README "Pagination". */
export const MAX_OFFSET = 10_000;

export const listCollegesQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(80).optional(),

    state: csvParam().optional(),
    city: csvParam().optional(),
    ownership: csvEnumParam(OWNERSHIPS).optional(),
    stream: csvEnumParam(STREAMS).optional(),
    degreeLevel: csvEnumParam(DEGREE_LEVELS).optional(),

    minFee: intParam({ min: 0, max: 100_000_000 }).optional(),
    maxFee: intParam({ min: 0, max: 100_000_000 }).optional(),
    minRating: floatParam({ min: 0, max: 5 }).optional(),
    maxNirfRank: intParam({ min: 1, max: 100_000 }).optional(),
    minMedianPackage: intParam({ min: 0, max: 100_000_000 }).optional(),
    establishedAfter: intParam({ min: 1800, max: 2100 }).optional(),

    sort: z.enum(SORT_OPTIONS).optional(),
    page: intParam({ min: 1, max: 100_000 }).optional(),
    pageSize: intParam({ min: 1, max: MAX_PAGE_SIZE }).optional(),
    facets: boolParam.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.minFee !== undefined && value.maxFee !== undefined && value.minFee > value.maxFee) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['minFee'],
        message: 'minFee cannot be greater than maxFee.',
      });
    }
    if (value.sort === 'relevance' && !value.q) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sort'],
        message: "sort=relevance requires a search term 'q'.",
      });
    }
    const page = value.page ?? 1;
    const pageSize = value.pageSize ?? 20;
    if ((page - 1) * pageSize > MAX_OFFSET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['page'],
        message: `Offset is capped at ${MAX_OFFSET} rows. Narrow the filters instead of paging deeper.`,
      });
    }
  });

export type ListCollegesQuery = z.infer<typeof listCollegesQuerySchema>;

export const compareQuerySchema = z
  .object({
    slugs: z
      .string()
      .transform((raw) => [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))])
      .pipe(
        z
          .array(z.string().min(1).max(120))
          .min(2, 'Compare at least 2 colleges.')
          .max(3, 'Compare at most 3 colleges.'),
      ),
  })
  .strict();

export const createReviewSchema = z
  .object({
    authorName: z.string().trim().min(2).max(60),
    authorEmail: z.string().trim().email().max(160),
    overallRating: z.number().int().min(1).max(5),
    academicsRating: z.number().int().min(1).max(5),
    infrastructureRating: z.number().int().min(1).max(5),
    placementsRating: z.number().int().min(1).max(5),
    facultyRating: z.number().int().min(1).max(5),
    title: z.string().trim().min(5).max(120),
    body: z.string().trim().min(40, 'Tell us at least a sentence or two.').max(4000),
    graduationYear: z
      .number()
      .int()
      .min(1950)
      .max(new Date().getFullYear() + 6),
  })
  .strict();

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
