import { Prisma } from '@prisma/client';
import type { CollegeCardRow } from './repository';

/**
 * Prisma returns DECIMAL columns as Decimal objects and COUNT as BigInt — both
 * of which `JSON.stringify` either mangles or throws on. Every value that leaves
 * the API goes through an explicit mapper, so the wire format is a deliberate
 * contract rather than whatever the driver happened to hand us.
 */
export function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

/** Indian salary/fee figures are read in lakhs. Send both — the client shouldn't do maths. */
export function toLakhs(inr: number | null): number | null {
  if (inr === null) return null;
  return Math.round((inr / 100_000) * 100) / 100;
}

export interface CollegeCardDto {
  id: string;
  slug: string;
  name: string;
  shortName: string | null;
  location: { city: string; state: string };
  ownership: string;
  establishedYear: number;
  nirfRank: number | null;
  naacGrade: string | null;
  rating: { average: number; count: number };
  courseCount: number;
  fees: { minAnnualInr: number | null; maxAnnualInr: number | null; minAnnualLakhs: number | null };
  placement: { medianPackageInr: number | null; medianPackageLakhs: number | null; rate: number | null };
}

export function toCollegeCard(row: CollegeCardRow): CollegeCardDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortName: row.shortName,
    location: { city: row.city, state: row.state },
    ownership: row.ownership,
    establishedYear: row.establishedYear,
    nirfRank: row.nirfRank,
    naacGrade: row.naacGrade,
    rating: { average: decimalToNumber(row.ratingAvg) ?? 0, count: row.ratingCount },
    courseCount: row.courseCount,
    fees: {
      minAnnualInr: row.minAnnualFeeInr,
      maxAnnualInr: row.maxAnnualFeeInr,
      minAnnualLakhs: toLakhs(row.minAnnualFeeInr),
    },
    placement: {
      medianPackageInr: row.latestMedianPackageInr,
      medianPackageLakhs: toLakhs(row.latestMedianPackageInr),
      rate: decimalToNumber(row.latestPlacementRate),
    },
  };
}
