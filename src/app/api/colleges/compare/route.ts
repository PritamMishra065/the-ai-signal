import { parseQuery } from '@/lib/validation/common';
import { route } from '@/lib/http/handler';
import { compareQuerySchema } from '@/modules/colleges/schema';
import { compareColleges } from '@/modules/colleges/service';

export const GET = route(async (_req, ctx) => {
  const { slugs } = parseQuery(compareQuerySchema, ctx.searchParams);
  return { data: await compareColleges(slugs) };
}, { cacheSeconds: 30 });
