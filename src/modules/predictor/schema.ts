import { z } from 'zod';
import { STREAMS } from '@/modules/colleges/schema';

export const CATEGORIES = ['GENERAL', 'EWS', 'OBC_NCL', 'SC', 'ST'] as const;
export const QUOTAS = ['ALL_INDIA', 'HOME_STATE'] as const;

export const predictRequestSchema = z
  .object({
    exam: z.string().trim().min(2).max(20).toUpperCase(),
    rank: z.number().int().positive('Rank starts at 1.').max(5_000_000),
    category: z.enum(CATEGORIES).default('GENERAL'),
    quota: z.enum(QUOTAS).default('ALL_INDIA'),
    /**
     * Required for HOME_STATE: without knowing the candidate's state we cannot
     * tell which colleges the home-state cutoffs even apply to.
     */
    homeState: z.string().trim().min(2).max(60).optional(),
    streams: z.array(z.enum(STREAMS)).max(8).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.quota === 'HOME_STATE' && !value.homeState) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['homeState'],
        message: "homeState is required when quota is 'HOME_STATE'.",
      });
    }
  });

export type PredictRequest = z.infer<typeof predictRequestSchema>;
