# RecruiterFlow — Candidate Matching Engine

A lightweight, deterministic candidate-job matching engine built for the RecruiterFlow internship assignment. It pairs candidates with open roles using a transparent 70/30 scoring formula, handwritten MySQL queries, and an optional AI embedding layer for semantic skill matching.

Built with **Node.js LTS**, **TypeScript (strict)**, **Express**, and **MySQL 8.x**. No ORMs, query builders, or heavy frameworks.

---

## Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
Create a `.env` file from the example:
```bash
cp .env.example .env
```
Update your MySQL credentials in `.env`:
```ini
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=recruiterflow

# Optional: Enable semantic skill matching (works offline with exact matching by default)
SEMANTIC_MATCHING_ENABLED=false
GOOGLE_AI_API_KEY=your_key_here
```

### 3. Seed the database
Make sure MySQL is running, then run:
```bash
npm run seed
```
This script creates the database and tables, then idempotently seeds all 15 supplied candidates and 6 jobs without creating duplicates on rerun.

### 4. Start the server
```bash
# Development (with live reload)
npm run dev

# Or build and run production
npm run build
npm start
```
The server starts at `http://localhost:3000`.

---

## API Endpoints & Example Requests

### `GET /jobs/:id/matches`
Ranks all candidates for a specific job posting.

```bash
curl http://localhost:3000/jobs/1/matches
```

**Example response:**
```json
{
  "jobId": 1,
  "jobTitle": "Backend Detective",
  "matches": [
    {
      "candidateId": 1,
      "candidateName": "Sherlock H.",
      "score": 100,
      "scoreBreakdown": {
        "skillScore": 70,
        "experienceScore": 30
      },
      "skills": {
        "required": 3,
        "exactMatches": 3,
        "semanticMatches": 0,
        "matched": 3,
        "matchedSkills": [
          { "requiredSkill": "deduction", "candidateSkill": "deduction", "matchType": "exact" },
          { "requiredSkill": "pattern-recognition", "candidateSkill": "pattern-recognition", "matchType": "exact" },
          { "requiredSkill": "forensics", "candidateSkill": "forensics", "matchType": "exact" }
        ],
        "missingSkills": []
      },
      "experience": {
        "candidateYears": 8,
        "minimumRequiredYears": 3,
        "meetsRequirement": true
      },
      "semanticMatching": {
        "status": "disabled",
        "used": false
      },
      "reason": "Matches all 3 required skills and meets the experience requirement."
    }
  ]
}
```

### `GET /candidates/:id/matches`
Ranks all jobs for a specific candidate using the identical algorithm.

```bash
curl http://localhost:3000/candidates/1/matches
```

Both endpoints return:
- **`score`**: Overall match score bounded between 0 and 100.
- **`scoreBreakdown`**: Exact points earned from skills vs experience.
- **`skills`**: Counts and names of matched, missing, and semantically mapped skills.
- **`experience`**: Candidate years vs minimum requirement.
- **`reason`**: Clear, human-readable sentence explaining the score.

---

## How Matching Works

The core matching algorithm is a pure, deterministic function (`calculateMatch` in `src/services/scoring.ts`) with zero dependencies on Express, MySQL, or AI networks.

### The 70 / 30 Scoring Formula

$$\text{Total Score} = \text{Skill Score (up to 70)} + \text{Experience Score (up to 30)}$$

1. **Skill Matching (70 points):**
   $$\text{skillScore} = 70 \times \frac{\text{Matched Required Skills}}{\text{Total Required Skills}}$$
   - Exact skill matches always resolve first.
   - Each required skill can only be satisfied once (1-to-1 mapping).
   - Extra candidate skills don't add random bonus points.

2. **Experience Fit (30 points):**
   $$\text{experienceScore} = 30 \times \min\left(\frac{\text{Candidate Experience}}{\text{Job Minimum Experience}}, 1\right)$$
   - Candidates with less experience get partial proportional points (e.g., 2 yrs for a 3-yr job gets $30 \times \frac{2}{3} = 20$ pts).
   - Experience points are capped at 30 so excessive tenure doesn't eclipse missing skills.

3. **Why 70/30?**
   In software roles, competency in the actual toolchain is paramount. We weight skills at 70% to prioritize technical capability, while allocating 30% to experience to give high-aptitude early-career candidates a fair shot.

4. **Deterministic Ranking:**
   Candidates are sorted by:
   1. `totalScore` descending (unrounded)
   2. Matched skill count descending
   3. Candidate ID ascending (stable tie-breaking)

---

## AI-Assisted Semantic Skill Matching

Text embeddings (Google Gemini `text-embedding-004` or OpenAI `text-embedding-3-small`) catch synonymous skills that differ in phrasing (e.g., `system design` $\leftrightarrow$ `systems-design`).

### Conservative Design Principles
- **Exact matches first:** Normalized string matching resolves identical skills before invoking any AI.
- **AI never sets the score:** Embeddings only compute a cosine similarity score (between 0 and 1) between unresolved skill labels.
- **Threshold gating (`0.82`):** Pairs below the threshold are rejected. Related but non-equivalent skills (like `sales` vs `negotiation` or `leadership` vs `mentorship`) do not match.
- **One-to-one greedy assignment:** One candidate skill cannot satisfy multiple requirements.
- **In-memory cache:** Skill vectors are cached in memory to minimize external network requests.
- **Privacy by default:** Only isolated skill strings are sent to embedding providers. Candidate names, notes, and profile details never leave your infrastructure.

### Graceful Fallback
If the embedding API is down, times out, or has no API key, the system does not crash or return a 500. It logs a warning, falls back to exact matching, and marks `"semanticMatching": { "status": "unavailable" }` in the response.

---

## Running the Tests

All tests run completely offline without needing a running MySQL instance or an AI API key.

```bash
# Run all 80 tests
npm run test:all

# Run pure scoring and semantic unit tests only (62 tests)
npm test

# Run HTTP API integration tests only (18 tests)
npm run test:api

# Type-check TypeScript in strict mode
npm run typecheck
```

### Semantic Benchmark Evaluation
To inspect how the similarity threshold performs against 20 labeled equivalent, formatting, and unrelated skill pairs:
```bash
npm run evaluate
```

---

## Database Design

Handwritten SQL schema defined in `sql/schema.sql`:
- **`candidates`**: ID, name, experience (years), availability, and quirky note.
- **`jobs`**: ID, title, minimum experience, and humorous tagline.
- **`skills`**: Master table of skills with a generated, normalized column (`LOWER(TRIM(name))`) and unique constraint to prevent duplicates.
- **`candidate_skills`**: Composite primary key `(candidate_id, skill_id)`.
- **`job_required_skills`**: Composite primary key `(job_id, skill_id)`.
- **`traits` & `candidate_traits`**: Normalized candidate personality traits.
- **`culture_keywords` & `job_culture_keywords`**: Normalized company culture attributes.

All database queries in `MatchingRepository` use parameterized queries (`?`) via the `mysql2` promise pool to prevent SQL injection.

---

## SQL Detective Challenge

The assignment's analytical queries are implemented in `sql/sql_detective.sql`:

1. **Question 1:** Open job postings and their responsible recruiter.
2. **Question 2:** Distinct applicants reaching the Final interview stage per job (including jobs with 0 final applicants via outer joins).
3. **Question 3:** Multi-job applicants with identity resolution using normalized emails (`LOWER(TRIM(a.email))`) to deduplicate candidates like "Ananya Rao".
4. **Question 4:** Recruiter final-stage interview conversion rate (`passed / total`) for recruiters with $\ge 3$ final interviews.
5. **Question 5:** Top recruiter per department using `RANK() OVER (PARTITION BY jp.department ORDER BY COUNT(*) DESC)` to handle ties cleanly.

Run them directly in MySQL:
```bash
mysql -u root -p recruiterflow < sql/sql_detective.sql
```

---

## Project Structure

```
recruiter-bot/
├── src/
│   ├── app.ts                 # Express app & route mounting
│   ├── server.ts              # Server startup & graceful shutdown
│   ├── config/env.ts          # Environment variable validation
│   ├── db/pool.ts             # MySQL connection pool
│   ├── middleware/            # Centralized error handler (400, 404, 500)
│   ├── repositories/          # Handwritten SQL data access
│   ├── routes/                # API routes & positive-int validation
│   └── services/
│       ├── scoring.ts         # Pure 70/30 matching math & reason generator
│       ├── embedding-provider.ts # AI interface (Gemini / OpenAI / Fake)
│       ├── semantic-matching.service.ts # Cosine similarity & 1-to-1 mapping
│       └── matching.service.ts # Shared orchestration service
├── scripts/
│   ├── seed.ts                # Repeatable database seeder
│   └── evaluate-semantic-matching.ts # Threshold benchmark evaluator
├── sql/
│   ├── schema.sql             # Normalized DDL
│   ├── seed.sql               # 15 candidates & 6 jobs
│   └── sql_detective.sql      # 5 challenge queries
└── tests/
    ├── scoring.test.ts        # 44 unit tests
    ├── semantic-matching.test.ts # 18 unit tests
    └── api.test.ts            # 18 API integration tests
```

---

## Limitations & Future Ideas

- **Vector search at scale:** For millions of jobs and skills, computing cosine similarity in-memory would bottleneck. MySQL 8.4 Vector or pgvector with approximate nearest neighbors (HNSW) would be the next step.
- **Distributed cache:** The in-memory embedding cache is currently process-bound; production multi-instance clusters would use Redis.
- **Availability weighting:** Candidate availability (`Immediate` vs `Not looking`) could be exposed as a configurable filter or ranking tie-breaker.
