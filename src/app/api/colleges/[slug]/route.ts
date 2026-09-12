import { route } from '@/lib/http/handler';
import { getCollegeDetail } from '@/modules/colleges/service';

export const GET = route<unknown, { slug: string }>(async (_req, ctx) => {
  return { data: await getCollegeDetail(ctx.params.slug) };
}, { cacheSeconds: 60 });
