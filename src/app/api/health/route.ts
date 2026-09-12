import { prisma } from '@/lib/db';
import { route } from '@/lib/http/handler';

export const GET = route(async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { data: { status: 'ok', service: 'college-discovery-api' } };
}, { cacheSeconds: 5 });
