import { PrismaClient, Ownership, Stream, DegreeLevel, Category, Quota, ReviewStatus } from '@prisma/client';
import { loadEnvFile } from 'node:process';
import { normalizeName } from '../src/lib/normalize';
import { buildSearchText, recomputeCollegeAggregates } from '../src/modules/colleges/aggregates';

try { loadEnvFile('.env'); } catch { /* deployment environments provide variables directly */ }

const prisma = new PrismaClient();

const colleges = [
  {
    slug: 'indian-institute-of-technology-delhi', name: 'Indian Institute of Technology Delhi', shortName: 'IIT Delhi', city: 'New Delhi', state: 'Delhi', ownership: Ownership.GOVERNMENT, establishedYear: 1961, nirfRank: 4,
    description: 'A leading public technical institute known for engineering research, innovation and strong industry outcomes.', website: 'https://home.iitd.ac.in', naacGrade: 'A++', campusAreaAcres: 325, approvedBy: ['AICTE', 'UGC'],
    courses: [{ slug: 'btech-computer-science', name: 'B.Tech Computer Science and Engineering', degreeLevel: DegreeLevel.UNDERGRADUATE, stream: Stream.ENGINEERING, durationMonths: 48, annualFeeInr: 220000, totalSeats: 99 }],
    placement: { year: 2024, medianPackageInr: 2500000, averagePackageInr: 2900000, highestPackageInr: 10000000, placementRatePct: 92, studentsPlaced: 950, topRecruiters: ['Google', 'Microsoft', 'Adobe'] },
  },
  {
    slug: 'bits-pilani', name: 'Birla Institute of Technology and Science, Pilani', shortName: 'BITS Pilani', city: 'Pilani', state: 'Rajasthan', ownership: Ownership.DEEMED, establishedYear: 1964, nirfRank: 20,
    description: 'A private deemed university offering practice-oriented programmes in engineering, sciences and management.', website: 'https://www.bits-pilani.ac.in', naacGrade: 'A', campusAreaAcres: 328, approvedBy: ['UGC'],
    courses: [{ slug: 'be-computer-science', name: 'B.E. Computer Science', degreeLevel: DegreeLevel.UNDERGRADUATE, stream: Stream.ENGINEERING, durationMonths: 48, annualFeeInr: 540000, totalSeats: 150 }],
    placement: { year: 2024, medianPackageInr: 1800000, averagePackageInr: 2100000, highestPackageInr: 6000000, placementRatePct: 88, studentsPlaced: 720, topRecruiters: ['Amazon', 'Qualcomm', 'Flipkart'] },
  },
  {
    slug: 'iit-bombay', name: 'Indian Institute of Technology Bombay', shortName: 'IIT Bombay', city: 'Mumbai', state: 'Maharashtra', ownership: Ownership.GOVERNMENT, establishedYear: 1958, nirfRank: 3,
    description: 'A premier public institute with nationally recognised engineering, science and technology programmes.', website: 'https://www.iitb.ac.in', naacGrade: 'A++', campusAreaAcres: 550, approvedBy: ['AICTE', 'UGC'],
    courses: [{ slug: 'btech-electrical-engineering', name: 'B.Tech Electrical Engineering', degreeLevel: DegreeLevel.UNDERGRADUATE, stream: Stream.ENGINEERING, durationMonths: 48, annualFeeInr: 220000, totalSeats: 122 }],
    placement: { year: 2024, medianPackageInr: 2400000, averagePackageInr: 2800000, highestPackageInr: 12000000, placementRatePct: 94, studentsPlaced: 1100, topRecruiters: ['Apple', 'Google', 'Goldman Sachs'] },
  },
] as const;

async function main() {
  const exam = await prisma.exam.upsert({ where: { code: 'JEE_MAIN' }, update: {}, create: { code: 'JEE_MAIN', name: 'JEE Main', stream: Stream.ENGINEERING, maxRank: 1500000 } });

  for (const item of colleges) {
    const college = await prisma.college.upsert({
      where: { slug: item.slug },
      update: { name: item.name, shortName: item.shortName, city: item.city, state: item.state, searchText: buildSearchText({ name: item.name, shortName: item.shortName, city: item.city, state: item.state, streams: item.courses.map((c) => c.stream) }) },
      create: { slug: item.slug, name: item.name, normalizedName: normalizeName(item.name), shortName: item.shortName, city: item.city, state: item.state, ownership: item.ownership, establishedYear: item.establishedYear, description: item.description, website: item.website, naacGrade: item.naacGrade, nirfRank: item.nirfRank, campusAreaAcres: item.campusAreaAcres, approvedBy: [...item.approvedBy], searchText: buildSearchText({ name: item.name, shortName: item.shortName, city: item.city, state: item.state, streams: item.courses.map((c) => c.stream) }) },
    });

    for (const courseInput of item.courses) {
      const course = await prisma.course.upsert({ where: { collegeId_slug: { collegeId: college.id, slug: courseInput.slug } }, update: courseInput, create: { ...courseInput, collegeId: college.id } });
      await prisma.cutoff.upsert({ where: { courseId_examId_year_round_category_quota: { courseId: course.id, examId: exam.id, year: 2024, round: 6, category: Category.GENERAL, quota: Quota.ALL_INDIA } }, update: { openingRank: item.slug === 'iit-bombay' ? 1 : item.slug === 'indian-institute-of-technology-delhi' ? 2 : 800, closingRank: item.slug === 'iit-bombay' ? 450 : item.slug === 'indian-institute-of-technology-delhi' ? 700 : 18000 }, create: { collegeId: college.id, courseId: course.id, examId: exam.id, year: 2024, round: 6, category: Category.GENERAL, quota: Quota.ALL_INDIA, openingRank: item.slug === 'iit-bombay' ? 1 : item.slug === 'indian-institute-of-technology-delhi' ? 2 : 800, closingRank: item.slug === 'iit-bombay' ? 450 : item.slug === 'indian-institute-of-technology-delhi' ? 700 : 18000 } });
    }

    await prisma.placementStat.upsert({ where: { collegeId_year: { collegeId: college.id, year: item.placement.year } }, update: { ...item.placement, topRecruiters: [...item.placement.topRecruiters] }, create: { ...item.placement, topRecruiters: [...item.placement.topRecruiters], collegeId: college.id } });
    await prisma.review.upsert({ where: { collegeId_authorKey: { collegeId: college.id, authorKey: `seed-${item.slug}` } }, update: {}, create: { collegeId: college.id, authorKey: `seed-${item.slug}`, authorName: 'Demo Student', overallRating: 5, academicsRating: 5, infrastructureRating: 4, placementsRating: 5, facultyRating: 4, title: 'Strong academic foundation', body: 'A representative seed review for local development and API demos.', graduationYear: 2023, status: ReviewStatus.PUBLISHED } });
    await prisma.$transaction(async (tx) => recomputeCollegeAggregates(tx, college.id));
  }
}

main().then(async () => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
