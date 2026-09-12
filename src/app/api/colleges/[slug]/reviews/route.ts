import { route } from '@/lib/http/handler';
import { parseQuery, intParam } from '@/lib/validation/common';
import { createReviewSchema } from '@/modules/colleges/schema';
import { createReview, listReviews } from '@/modules/reviews/service';
import { enforceRateLimit } from '@/lib/http/rate-limit';
import { z } from 'zod';

const reviewsQuerySchema = z.object({
  page: intParam({ min: 1, max: 100_000 }).optional(),
  pageSize: intParam({ min: 1, max: 50 }).optional(),
}).strict();

export const GET = route<unknown, { slug: string }>(async (_req, ctx) => {
  const query = parseQuery(reviewsQuerySchema, ctx.searchParams);
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 10;
  const result = await listReviews(ctx.params.slug, page, pageSize);
  return { data: result.data, meta: { pagination: result.pagination } };
}, { cacheSeconds: 30 });

export const POST = route<unknown, { slug: string }>(async (req, ctx) => {
  enforceRateLimit(req, { key: 'review-create', limit: 5, windowSeconds: 60 });
  const input = createReviewSchema.parse(await req.json());
  return { data: await createReview(ctx.params.slug, input), status: 201 };
});
