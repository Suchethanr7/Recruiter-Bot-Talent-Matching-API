/**
 * API integration tests.
 *
 * Tests the HTTP endpoints by mocking the repository layer.
 * Does NOT require a running MySQL instance.
 *
 * Run: npm run test:api
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/app.js';
import { MatchingService } from '../src/services/matching.service.js';
import { SemanticMatchingService } from '../src/services/semantic-matching.service.js';
import { FakeEmbeddingProvider } from '../src/services/embedding-provider.js';
import type { MatchingRepository, CandidateRecord, JobRecord, CandidateWithSkills, JobWithSkills } from '../src/repositories/matching.repository.js';

// ============================================================================
// Mock Repository
// ============================================================================

class MockMatchingRepository implements MatchingRepository {
  private pool: unknown = null; // Not used in mock

  private candidates: CandidateRecord[] = [
    { id: 1, name: 'Sherlock H.', experience: 8, availability: 'Immediate', quirk: 'Solves problems by eliminating the impossible.' },
    { id: 2, name: 'Hermione G.', experience: 4, availability: '2 weeks', quirk: 'Reads the entire documentation first.' },
    { id: 5, name: 'Ron S.', experience: 15, availability: 'Not looking', quirk: 'Refuses to use more than one monitor.' },
  ];

  private jobs: JobRecord[] = [
    { id: 1, title: 'Backend Detective', minExperience: 3, tagline: 'We have a bug.' },
    { id: 3, title: 'Developer Relations Lead', minExperience: 2, tagline: 'Explain complex things.' },
  ];

  private candidateSkillsMap: Record<number, string[]> = {
    1: ['deduction', 'pattern-recognition', 'forensics'],
    2: ['research', 'time-management', 'public-speaking'],
    5: ['woodworking', 'minimalism', 'negotiation'],
  };

  private jobSkillsMap: Record<number, string[]> = {
    1: ['deduction', 'pattern-recognition', 'forensics'],
    3: ['public-speaking', 'research'],
  };

  async getJobById(jobId: number): Promise<JobRecord | null> {
    return this.jobs.find(j => j.id === jobId) ?? null;
  }

  async getJobRequiredSkills(jobId: number): Promise<string[]> {
    return this.jobSkillsMap[jobId] ?? [];
  }

  async getCandidateById(candidateId: number): Promise<CandidateRecord | null> {
    return this.candidates.find(c => c.id === candidateId) ?? null;
  }

  async getCandidateSkills(candidateId: number): Promise<string[]> {
    return this.candidateSkillsMap[candidateId] ?? [];
  }

  async getAllCandidatesWithSkills(): Promise<CandidateWithSkills[]> {
    return this.candidates.map(c => ({
      ...c,
      skills: this.candidateSkillsMap[c.id] ?? [],
    }));
  }

  async getAllJobsWithSkills(): Promise<JobWithSkills[]> {
    return this.jobs.map(j => ({
      ...j,
      requiredSkills: this.jobSkillsMap[j.id] ?? [],
    }));
  }

  async jobExists(jobId: number): Promise<boolean> {
    return this.jobs.some(j => j.id === jobId);
  }

  async candidateExists(candidateId: number): Promise<boolean> {
    return this.candidates.some(c => c.id === candidateId);
  }
}

// ============================================================================
// Test Setup
// ============================================================================

function makeRequest(
  server: http.Server,
  path: string
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const address = server.address();
    if (!address || typeof address === 'string') {
      reject(new Error('Server not started'));
      return;
    }

    const req = http.request(
      { hostname: '127.0.0.1', port: address.port, path, method: 'GET' },
      (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode ?? 500, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 500, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ============================================================================
// Tests
// ============================================================================

describe('API Endpoints', () => {
  let server: http.Server;

  before(async () => {
    const mockRepo = new MockMatchingRepository();
    const semanticService = new SemanticMatchingService(
      new FakeEmbeddingProvider(),
      { enabled: false, similarityThreshold: 0.82, cacheMaxSize: 100 }
    );
    const matchingService = new MatchingService(mockRepo as any, semanticService);
    const app = createApp(matchingService);
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // --------------------------------------------------------------------------
  // GET /jobs/:id/matches
  // --------------------------------------------------------------------------

  describe('GET /jobs/:id/matches', () => {
    it('returns ranked candidates for a valid job', async () => {
      const { status, body } = await makeRequest(server, '/jobs/1/matches');
      assert.equal(status, 200);

      const data = body as any;
      assert.equal(data.jobId, 1);
      assert.equal(data.jobTitle, 'Backend Detective');
      assert.ok(Array.isArray(data.matches));
      assert.ok(data.matches.length > 0);

      // Sherlock (ID 1) should be ranked first — perfect match
      assert.equal(data.matches[0].candidateId, 1);
      assert.equal(data.matches[0].score, 100);
      assert.equal(data.matches[0].scoreBreakdown.skillScore, 70);
      assert.equal(data.matches[0].scoreBreakdown.experienceScore, 30);
    });

    it('returns correct score breakdown', async () => {
      const { body } = await makeRequest(server, '/jobs/1/matches');
      const data = body as any;
      const sherlock = data.matches.find((m: any) => m.candidateId === 1);

      assert.ok(sherlock);
      assert.equal(sherlock.skills.required, 3);
      assert.equal(sherlock.skills.exactMatches, 3);
      assert.equal(sherlock.skills.matched, 3);
      assert.equal(sherlock.skills.missingSkills.length, 0);
      assert.equal(sherlock.experience.meetsRequirement, true);
    });

    it('ranks candidates with no skill overlap last', async () => {
      const { body } = await makeRequest(server, '/jobs/1/matches');
      const data = body as any;

      // Ron S. (ID 5) has no matching skills
      const ron = data.matches.find((m: any) => m.candidateId === 5);
      assert.ok(ron);
      assert.equal(ron.skills.matched, 0);
      assert.ok(ron.score < 100);

      // Ron should be ranked after Sherlock
      const sherlockIdx = data.matches.findIndex((m: any) => m.candidateId === 1);
      const ronIdx = data.matches.findIndex((m: any) => m.candidateId === 5);
      assert.ok(sherlockIdx < ronIdx);
    });

    it('returns 400 for invalid job ID', async () => {
      const { status, body } = await makeRequest(server, '/jobs/abc/matches');
      assert.equal(status, 400);
      assert.equal((body as any).error, 'Invalid job ID');
    });

    it('returns 400 for negative job ID', async () => {
      const { status } = await makeRequest(server, '/jobs/-1/matches');
      assert.equal(status, 400);
    });

    it('returns 400 for zero job ID', async () => {
      const { status } = await makeRequest(server, '/jobs/0/matches');
      assert.equal(status, 400);
    });

    it('returns 400 for decimal job ID', async () => {
      const { status } = await makeRequest(server, '/jobs/1.5/matches');
      assert.equal(status, 400);
    });

    it('returns 404 for nonexistent job', async () => {
      const { status, body } = await makeRequest(server, '/jobs/999/matches');
      assert.equal(status, 404);
      assert.equal((body as any).error, 'Not Found');
    });
  });

  // --------------------------------------------------------------------------
  // GET /candidates/:id/matches
  // --------------------------------------------------------------------------

  describe('GET /candidates/:id/matches', () => {
    it('returns ranked jobs for a valid candidate', async () => {
      const { status, body } = await makeRequest(server, '/candidates/1/matches');
      assert.equal(status, 200);

      const data = body as any;
      assert.equal(data.candidateId, 1);
      assert.equal(data.candidateName, 'Sherlock H.');
      assert.ok(Array.isArray(data.matches));
      assert.ok(data.matches.length > 0);
    });

    it('returns correct job match for Sherlock → Backend Detective', async () => {
      const { body } = await makeRequest(server, '/candidates/1/matches');
      const data = body as any;

      const backendDetective = data.matches.find((m: any) => m.jobId === 1);
      assert.ok(backendDetective);
      assert.equal(backendDetective.score, 100);
    });

    it('returns 400 for invalid candidate ID', async () => {
      const { status } = await makeRequest(server, '/candidates/abc/matches');
      assert.equal(status, 400);
    });

    it('returns 404 for nonexistent candidate', async () => {
      const { status } = await makeRequest(server, '/candidates/999/matches');
      assert.equal(status, 404);
    });
  });

  // --------------------------------------------------------------------------
  // Score consistency
  // --------------------------------------------------------------------------

  describe('Score consistency between endpoints', () => {
    it('same candidate-job pair has same score from both endpoints', async () => {
      const { body: jobMatches } = await makeRequest(server, '/jobs/1/matches');
      const { body: candidateMatches } = await makeRequest(server, '/candidates/1/matches');

      const fromJob = (jobMatches as any).matches.find((m: any) => m.candidateId === 1);
      const fromCandidate = (candidateMatches as any).matches.find((m: any) => m.jobId === 1);

      assert.equal(fromJob.score, fromCandidate.score);
      assert.equal(fromJob.scoreBreakdown.skillScore, fromCandidate.scoreBreakdown.skillScore);
      assert.equal(
        fromJob.scoreBreakdown.experienceScore,
        fromCandidate.scoreBreakdown.experienceScore
      );
    });
  });

  // --------------------------------------------------------------------------
  // Semantic matching fallback
  // --------------------------------------------------------------------------

  describe('Semantic matching status', () => {
    it('reports semantic matching as disabled when configured off', async () => {
      const { body } = await makeRequest(server, '/jobs/1/matches');
      const data = body as any;
      const match = data.matches[0];

      assert.equal(match.semanticMatching.status, 'disabled');
    });
  });

  // --------------------------------------------------------------------------
  // Error handling
  // --------------------------------------------------------------------------

  describe('Error handling', () => {
    it('does not expose internal exceptions in responses', async () => {
      const { body } = await makeRequest(server, '/jobs/999/matches');
      const data = body as any;

      // Should not contain stack traces
      assert.ok(!JSON.stringify(data).includes('at '));
      assert.ok(!JSON.stringify(data).includes('Error:'));
    });

    it('returns 404 for unknown routes', async () => {
      const { status } = await makeRequest(server, '/unknown-route');
      assert.equal(status, 404);
    });
  });

  // --------------------------------------------------------------------------
  // Health check
  // --------------------------------------------------------------------------

  describe('GET /health', () => {
    it('returns ok status', async () => {
      const { status, body } = await makeRequest(server, '/health');
      assert.equal(status, 200);
      assert.equal((body as any).status, 'ok');
    });
  });
});

// ============================================================================
// Semantic matching failure fallback (separate test with failing provider)
// ============================================================================

describe('Semantic matching failure fallback', () => {
  let server: http.Server;

  before(async () => {
    const mockRepo = new MockMatchingRepository();
    const failingProvider = new FakeEmbeddingProvider();
    failingProvider.shouldFail = true;
    failingProvider.failMessage = 'Simulated API failure';

    const semanticService = new SemanticMatchingService(failingProvider, {
      enabled: true,
      similarityThreshold: 0.82,
      cacheMaxSize: 100,
    });
    const matchingService = new MatchingService(mockRepo as any, semanticService);
    const app = createApp(matchingService);
    server = await new Promise<http.Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('falls back to exact matching when provider fails', async () => {
    const { status, body } = await makeRequest(server, '/jobs/1/matches');
    assert.equal(status, 200);

    const data = body as any;
    assert.ok(Array.isArray(data.matches));

    // Should still return results using exact matching
    const sherlock = data.matches.find((m: any) => m.candidateId === 1);
    assert.ok(sherlock);
    assert.equal(sherlock.score, 100); // All exact matches

    // Candidate with unresolved skills attempted semantic matching, which failed
    const ron = data.matches.find((m: any) => m.candidateId === 5);
    assert.ok(ron);
    assert.equal(ron.semanticMatching.status, 'unavailable');
  });
});


