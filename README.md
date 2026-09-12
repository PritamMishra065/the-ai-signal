# College Discovery API

Backend submission for the College Discovery Platform track of the AI Software Engineer Internship assignment.

## Architecture

- `src/app/api` contains thin Next.js REST route handlers.
- `src/modules` contains domain services, validation schemas, repositories, mappers and scoring logic.
- `src/lib/http` provides one response envelope, request IDs, error mapping and rate limiting.
- Prisma models the relational data and keeps searchable college aggregates denormalised for fast listing queries.
- Public writes are intentionally narrow: users can submit one review per college; curated data ingestion can be added behind `requireAdmin`.

## Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Database-backed health check |
| GET | `/api/colleges` | Search, filters, facets, sorting and bounded page pagination |
| GET | `/api/colleges/:slug` | College overview, courses, placements and recent reviews |
| GET | `/api/colleges/compare?slugs=iit-bombay,bits-pilani` | Server-side comparison matrix and winners |
| POST | `/api/predict` | Rank-based recommendations using historical cutoffs |
| GET | `/api/colleges/:slug/reviews?page=1&pageSize=10` | Paginated published reviews |
| POST | `/api/colleges/:slug/reviews` | Validated review submission with duplicate protection |

Successful responses use `{ data, meta }`; errors use `{ error, meta }` with stable error codes and a request ID.

## Run locally

```powershell
npm install
docker compose up -d
npm run db:push
npm run db:seed
npm run dev
```

Useful checks:

```powershell
npm run typecheck
npm test
```

The seed is safe to re-run and creates three representative colleges, one exam, courses, placements, a review and cutoff data for local API demos.

## Deploy for free

Use a free PostgreSQL provider such as Neon, then set `DATABASE_URL` and `DIRECT_URL` in the deployment environment. Run `npm run db:push` once against that database and `npm run db:seed` once to load the demo data.

- Vercel: import the GitHub repository. The included `vercel.json` uses the Next.js build. Add the three environment variables `DATABASE_URL`, `DIRECT_URL` and `ADMIN_API_KEY` in Project Settings.
- Render: create a Web Service from the repository. The included `render.yaml` uses the free Node service, builds Prisma and Next.js, and exposes `/api/health` for health checks. Add the same environment variables in Render.

Do not commit `.env`; use `.env.example` as the deployment variable checklist.

## Key backend decisions

- Money is stored as integer INR values; no floating-point persistence.
- Search input is parameterised and uses PostgreSQL full-text prefix matching plus an `ILIKE` fallback.
- Course filters are combined inside one `EXISTS` predicate, so stream and fee constraints apply to the same course.
- Pagination is offset-based but capped at 10,000 rows to avoid unbounded deep scans.
- Review creation and cached rating recomputation occur in one transaction.
- Predictor results are grouped by college, preserve matching courses, and explain the probability bucket and cutoff trend.
