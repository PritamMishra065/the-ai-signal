import { route } from '@/lib/http/handler';
import { predictRequestSchema } from '@/modules/predictor/schema';
import { predictColleges } from '@/modules/predictor/service';

export const POST = route(async (req) => {
  const input = predictRequestSchema.parse(await req.json());
  return { data: await predictColleges(input) };
}, { cacheSeconds: 30 });
