import { parseQuery } from '@/lib/validation/common';
import { route } from '@/lib/http/handler';
import { listCollegesQuerySchema } from '@/modules/colleges/schema';
import { listColleges } from '@/modules/colleges/service';

export const GET = route(async (_req, ctx) => {
  const query = parseQuery(listCollegesQuerySchema, ctx.searchParams);
  const result = await listColleges(query);
  return { data: result.data, meta: result.meta };
}, { cacheSeconds: 30 });
