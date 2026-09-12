import { prisma } from '@/lib/db';
import { AppError } from '@/lib/http/errors';
import { hashEmail } from '@/lib/normalize';
import { recomputeCollegeAggregates } from '@/modules/colleges/aggregates';
import type { CreateReviewInput } from '@/modules/colleges/schema';

/**
 * Creating a review is the one write path a public client can reach, so it
 * carries the full treatment:
 *   1. the college must exist (404, not a foreign-key crash)
 *   2. one review per person per college, enforced by a UNIQUE index — the
 *      check below is a courtesy for a nicer message, the index is the guarantee
 *   3. the review and the college's cached rating move in ONE transaction, so a
 *      crash can never leave ratingAvg disagreeing with the reviews table
 */
export async function createReview(slug: string, input: CreateReviewInput) {
  const college = await prisma.college.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!college) throw AppError.notFound('College', slug);

  const authorKey = hashEmail(input.authorEmail);

  const existing = await prisma.review.findUnique({
    where: { collegeId_authorKey: { collegeId: college.id, authorKey } },
    select: { id: true },
  });
  if (existing) {
    throw AppError.conflict('You have already reviewed this college.', {
      reviewId: existing.id,
    });
  }

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: {
        collegeId: college.id,
        authorKey,
        authorName: input.authorName,
        overallRating: input.overallRating,
        academicsRating: input.academicsRating,
        infrastructureRating: input.infrastructureRating,
        placementsRating: input.placementsRating,
        facultyRating: input.facultyRating,
        title: input.title,
        body: input.body,
        graduationYear: input.graduationYear,
        status: 'PUBLISHED',
      },
    });

    await recomputeCollegeAggregates(tx, college.id);
    return created;
  });

  return {
    id: review.id,
    authorName: review.authorName,
    title: review.title,
    body: review.body,
    graduationYear: review.graduationYear,
    ratings: {
      overall: review.overallRating,
      academics: review.academicsRating,
      infrastructure: review.infrastructureRating,
      placements: review.placementsRating,
      faculty: review.facultyRating,
    },
    status: review.status,
    createdAt: review.createdAt.toISOString(),
  };
}

export async function listReviews(slug: string, page: number, pageSize: number) {
  const college = await prisma.college.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!college) throw AppError.notFound('College', slug);

  const [reviews, total] = await prisma.$transaction([
    prisma.review.findMany({
      where: { collegeId: college.id, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.review.count({ where: { collegeId: college.id, status: 'PUBLISHED' } }),
  ]);

  return {
    data: reviews.map((review) => ({
      id: review.id,
      authorName: review.authorName,
      title: review.title,
      body: review.body,
      graduationYear: review.graduationYear,
      ratings: {
        overall: review.overallRating,
        academics: review.academicsRating,
        infrastructure: review.infrastructureRating,
        placements: review.placementsRating,
        faculty: review.facultyRating,
      },
      createdAt: review.createdAt.toISOString(),
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasNextPage: (page - 1) * pageSize + reviews.length < total,
    },
  };
}
