# RecruiterFlow Candidate Matcher

A backend API that ranks candidates for jobs (and jobs for candidates) using skills, experience, availability, and explicit work preferences. It uses Node.js, TypeScript, Express, MySQL, and optional Google Gemini/OpenAI embeddings for semantic skill matching.

## Run locally

Requirements: Node.js 20+, MySQL 8+, and an available MySQL account.

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` and set `DB_USER`, `DB_PASSWORD`, and `DB_NAME=recruiterflow`. To enable semantic skill matching, keep `SEMANTIC_MATCHING_ENABLED=true`, set `EMBEDDING_PROVIDER=google-ai`, and add a valid Google AI key to `GOOGLE_AI_API_KEY`. Without a working key, the API still runs with exact skill matching.

With MySQL running:

```powershell
npm run seed
npm run dev
```

Keep the server terminal open. Try these in another PowerShell window:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

Open `http://localhost:3000/jobs/1/matches` or `http://localhost:3000/candidates/1/matches` in a browser to view the ranked results as HTML tables.

`npm run seed` creates/upgrades the schema, then inserts or updates the 15 supplied candidates and 6 jobs. It preserves their skills, experience, availability, traits, quirks, required skills, culture keywords, and taglines. It is safe to rerun and does not delete existing records. Stop the server with Ctrl+C.

## What the API does

- `GET /health` — verifies the HTTP server is responding.
- `GET /jobs/:id/matches` — ranks candidates for a job.
- `GET /candidates/:id/matches` — ranks jobs for a candidate.

The match endpoints return HTML pages with ranked-results tables. The job endpoint includes job ID/title and, for each ranked candidate, rank, candidate ID/name, score, and reason. The candidate endpoint shows the corresponding candidate ID/name and ranked jobs. Results rank by full-precision score, then number of matched skills, then ascending candidate/job ID; display rounding does not change order. Invalid IDs return 400; nonexistent records return 404.

Example job match table:

```html
<table>
  <thead>
    <tr>
      <th>Job ID</th><th>Job Title</th><th>Rank</th>
      <th>Candidate ID</th><th>Candidate Name</th><th>Score</th><th>Reason</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>1</td><td>Backend Detective</td><td>1</td>
      <td>1</td><td>Sherlock H.</td><td>100</td>
      <td>Matches all 3 required skills and meets the experience requirement.</td>
    </tr>
  </tbody>
</table>
```

## Scoring

| Component | Maximum | Rule |
|---|---:|---|
| Skills | 60 | 60 × matched required skills ÷ total required skills |
| Experience | 25 | 25 × min(candidate years ÷ job minimum years, 1) |
| Availability | 10 | Full points if candidate meets the job’s start-time requirement; otherwise 0 |
| Preferences | 5 | Divided evenly over comparable work arrangement, schedule, and travel preferences |

Availability uses `Immediate`, `2 weeks`, and `Not looking` for candidates; jobs can require `immediate`, `within_2_weeks`, or `flexible`. Missing job availability requirements are neutral.

Preferences are explicit categorical values, not personality guesses. `flexible` candidates and `flexible`/`any` job requirements are compatible; travel willingness is ordered `none` < `occasional` < `frequent`. Missing candidate responses are not mismatches; if no preferences can be compared, those points are neutral. Demo preferences in the seed file are fictional and should be replaced with real, candidate-stated data before relying on rankings.

Skills are checked by normalized exact text first. If semantic matching is enabled, the service sends only unresolved skill labels to the configured embedding provider, compares vectors using cosine similarity, and accepts pairs at or above `SEMANTIC_SIMILARITY_THRESHOLD` (default `0.82`). Matches are one-to-one. Embeddings add skill matches; the AI provider does not set the score. Provider failures fall back to exact matching and return semantic status `unavailable`.

## Design decisions and trade-offs

The score gives skills 60 points and experience 25 because they are the core job requirements. Availability contributes 10 points, and the final 5 points compare explicit work arrangement, schedule, and travel preferences. Exact skill matches are preferred; optional semantic matching can recognize equivalent labels, but its threshold is configurable and should be evaluated against real skill data before production use. Ranking uses the full-precision score, then the number of matched skills, then the lower ID for deterministic ordering.

Traits and culture keywords from the assignment are stored but do not affect ranking. This avoids inferring job fit from subjective personality labels or humorous profile descriptions. The preference score instead uses explicit, job-related values. Missing comparable preference data is treated neutrally, which avoids penalizing incomplete profiles but can give less information than a complete profile. The weights and rules are a transparent baseline, not a statistically validated hiring model.

## AI tool use

ChatGPT and GitHub Copilot were used during development to discuss and explain the design, assist with code and test changes, and improve documentation. The semantic-matching feature itself uses optional Google Gemini or OpenAI embedding APIs only for skill-label comparisons; it does not send candidate names or profile quirks to those providers. The developer remains responsible for reviewing and validating the submitted code and SQL.

## Project map

```text
src/
  app.ts                         HTTP routes, validation, and error responses
  server.ts                      Startup, dependency wiring, graceful shutdown
  config/env.ts                  .env loading and validation
  db/pool.ts                     MySQL connection pool
  repositories/matching.repository.ts  Parameterized database queries
  services/matching.service.ts   Coordinates data, semantic matching, and ranking
  services/scoring.ts            Pure deterministic scoring calculations
  services/semantic-matching.service.ts Embedding similarity and cache
  services/embedding-provider.ts Google/OpenAI providers and test fake
scripts/seed.ts                  Creates schema and loads sample records
scripts/evaluate-semantic-matching.ts Evaluates semantic threshold on labeled pairs
sql/schema.sql                   Seven-table MySQL schema
sql/seed.sql                     Sample candidate, job, skill, and preference data
sql/sql_detective.sql            Separate SQL challenge queries
tests/                           Offline scoring, semantic, and API tests
```

The seven tables are `candidates`, `jobs`, `skills`, `candidate_skills`, `job_required_skills`, `candidate_preferences`, and `job_preferences`. Candidate traits and job culture keywords are stored as JSON arrays on their respective records, avoiding extra lookup/junction tables for small descriptive lists. The matching score does not use traits, culture keywords, humorous quirks, or job taglines; those are ingested assignment data, not scoring signals.

## Checks and utilities

```powershell
npm run test:all
npm run typecheck
npm run build
npm run evaluate
```

Tests use a fake embedding provider and run offline. `npm run evaluate` uses the configured real embedding provider and sends only the labeled skill phrases. `sql/sql_detective.sql` is a separate assignment exercise and can be run with the MySQL CLI.

Keep `.env` and API keys private; do not commit credentials.
