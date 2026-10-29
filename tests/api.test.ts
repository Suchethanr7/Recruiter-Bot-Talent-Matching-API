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
    { id: 1, title: 'Backend Detective', minExperience: 3, tagline: 'We have a bug.', availabilityRequirement: null },
    { id: 3, title: 'Developer Relations Lead', minExperience: 2, tagline: 'Explain complex things.', availabilityRequirement: null },
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

  async getJobPreferences(): Promise<[]> {
    return [];
  }

  async getCandidateById(candidateId: number): Promise<CandidateRecord | null> {
    return this.candidates.find(c => c.id === candidateId) ?? null;
  }

  async getCandidateSkills(candidateId: number): Promise<string[]> {
    return this.candidateSkillsMap[candidateId] ?? [];
  }

  async getCandidatePreferences(): Promise<[]> {
    return [];
  }

  async getAllCandidatesWithSkills(): Promise<CandidateWithSkills[]> {
    return this.candidates.map(c => ({
      ...c,
      skills: this.candidateSkillsMap[c.id] ?? [],
      preferences: [],
    }));
  }

  async getAllJobsWithSkills(): Promise<JobWithSkills[]> {
    return this.jobs.map(j => ({
      ...j,
      requiredSkills: this.jobSkillsMap[j.id] ?? [],
      preferences: [],
    }));
  }

  async jobExists(jobId: number): Promise<boolean> {
    return this.jobs.some(j => j.id === jobId);
  }

  async candidateExists(candidateId: number): Promise<boolean> {
    return this.candidates.some(c => c.id === candidateId);
  }
}

class RankingTestRepository extends MockMatchingRepository {
  override async getJobById(jobId: number): Promise<JobRecord | null> {
    const job = await super.getJobById(jobId);
    return job ? { ...job, minExperience: 5 } : null;
  }

  override async getJobRequiredSkills(jobId: number): Promise<string[]> {
    return jobId === 1 ? Array.from({ length: 12 }, (_, index) => `required-${index + 1}`) : [];
  }

  override async getAllCandidatesWithSkills(): Promise<CandidateWithSkills[]> {
    return [
      { id: 20, name: 'Higher precise score', experience: 4.999, availability: 'Immediate', quirk: '', skills: [], preferences: [] },
      { id: 10, name: 'Lower precise score', experience: 4.998, availability: 'Immediate', quirk: '', skills: [], preferences: [] },
      { id: 30, name: 'More matched skills', experience: 4, availability: 'Immediate', quirk: '', skills: ['required-1'], preferences: [] },
      { id: 11, name: 'Lower ID tie', experience: 5, availability: 'Immediate', quirk: '', skills: [], preferences: [] },
      { id: 12, name: 'Higher ID tie', experience: 5, availability: 'Immediate', quirk: '', skills: [], preferences: [] },
    ];
  }
}

class JobRankingTestRepository extends MockMatchingRepository {
  override async getCandidateById(candidateId: number): Promise<CandidateRecord | null> {
    const candidate = await super.getCandidateById(candidateId);
    return candidate ? { ...candidate, experience: 4 } : null;
  }

  override async getCandidateSkills(): Promise<string[]> {
    return ['special'];
  }

  override async getAllJobsWithSkills(): Promise<JobWithSkills[]> {
    const requiredSkills = Array.from({ length: 12 }, (_, index) => `required-${index + 1}`);
    return [
      { id: 20, title: 'Higher precise score', minExperience: 1000, tagline: '', availabilityRequirement: null, requiredSkills, preferences: [] },
      { id: 10, title: 'Lower precise score', minExperience: 1001, tagline: '', availabilityRequirement: null, requiredSkills, preferences: [] },
      { id: 30, title: 'More matched skills', minExperience: 5, tagline: '', availabilityRequirement: null, requiredSkills: ['special', ...requiredSkills.slice(1)], preferences: [] },
      { id: 11, title: 'Lower ID tie', minExperience: 4, tagline: '', availabilityRequirement: null, requiredSkills: [], preferences: [] },
      { id: 12, title: 'Higher ID tie', minExperience: 4, tagline: '', availabilityRequirement: null, requiredSkills: [], preferences: [] },
    ];
  }
}

// ============================================================================
// Test Setup
// ============================================================================

function makeRequest(
  server: http.Server,
  path: string
): Promise<{ status: number; body: unknown; headers: http.IncomingHttpHeaders }> {
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
            resolve({ status: res.statusCode ?? 500, body: JSON.parse(data), headers: res.headers });
          } catch {
            resolve({ status: res.statusCode ?? 500, body: data, headers: res.headers });
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
      const { status, body, headers } = await makeRequest(server, '/jobs/1/matches');
      assert.equal(status, 200);

      assert.match(String(headers['content-type']), /^text\/html/);
      assert.ok(typeof body === 'string');
      assert.match(body, /<h1>Candidates for Backend Detective<\/h1>/);
      assert.match(body, /<th scope="col">Rank<\/th>/);
      assert.match(body, /<td>1<\/td><td>Backend Detective<\/td><td>1<\/td><td>1<\/td><td>Sherlock H\.<\/td><td>100<\/td>/);
    });

    it('includes the assignment-required fields for each candidate', async () => {
      const { body } = await makeRequest(server, '/jobs/1/matches');
      assert.ok(typeof body === 'string');
      assert.match(body, /<th scope="col">Candidate ID<\/th>/);
      assert.match(body, /<td>Sherlock H\.<\/td><td>100<\/td><td>Matches all 3 required skills/);
    });

    it('ranks candidates with no skill overlap last', async () => {
      const { body } = await makeRequest(server, '/jobs/1/matches');

      // Ron S. (ID 5) has no matching skills
      assert.ok(typeof body === 'string');
      const sherlockIdx = body.indexOf('<td>Sherlock H.</td>');
      const ronIdx = body.indexOf('<td>Ron S.</td>');
      assert.ok(sherlockIdx > 0);
      assert.ok(ronIdx > sherlockIdx);
    });

    it('uses full precision, matched skills, then lower ID to break ties', async () => {
      const semanticService = new SemanticMatchingService(
        new FakeEmbeddingProvider(),
        { enabled: false, similarityThreshold: 0.82, cacheMaxSize: 100 }
      );
      const app = createApp(new MatchingService(new RankingTestRepository() as any, semanticService));
      const rankingServer = await new Promise<http.Server>((resolve) => {
        const instance = app.listen(0, () => resolve(instance));
      });

      try {
        const { body } = await makeRequest(rankingServer, '/jobs/1/matches');
        assert.ok(typeof body === 'string');

        const positions = [30, 11, 12, 20, 10].map(id =>
          body.indexOf(`<td>${id}</td>`)
        );
        assert.ok(positions.every(position => position >= 0));
        assert.deepEqual(positions, [...positions].sort((a, b) => a - b));

        assert.match(body, /<td>20<\/td><td>Higher precise score<\/td><td>40<\/td>/);
        assert.match(body, /<td>10<\/td><td>Lower precise score<\/td><td>40<\/td>/);
      } finally {
        await new Promise<void>((resolve) => rankingServer.close(() => resolve()));
      }
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

      assert.ok(typeof body === 'string');
      assert.match(body, /<h1>Jobs for Sherlock H\.<\/h1>/);
      assert.match(body, /<th scope="col">Job Title<\/th>/);
      assert.match(body, /<td>1<\/td><td>Sherlock H\.<\/td><td>1<\/td><td>1<\/td><td>Backend Detective<\/td><td>100<\/td>/);
    });

    it('returns correct job match for Sherlock → Backend Detective', async () => {
      const { body } = await makeRequest(server, '/candidates/1/matches');
      assert.ok(typeof body === 'string');
      assert.match(body, /<td>Backend Detective<\/td><td>100<\/td><td>Matches all 3 required skills/);
    });

    it('uses full precision, matched skills, then lower ID to break job ties', async () => {
      const semanticService = new SemanticMatchingService(
        new FakeEmbeddingProvider(),
        { enabled: false, similarityThreshold: 0.82, cacheMaxSize: 100 }
      );
      const app = createApp(new MatchingService(new JobRankingTestRepository() as any, semanticService));
      const rankingServer = await new Promise<http.Server>((resolve) => {
        const instance = app.listen(0, () => resolve(instance));
      });

      try {
        const { body } = await makeRequest(rankingServer, '/candidates/1/matches');
        assert.ok(typeof body === 'string');

        const positions = [
          'More matched skills',
          'Lower ID tie',
          'Higher ID tie',
          'Higher precise score',
          'Lower precise score',
        ].map(title => body.indexOf(`<td>${title}</td>`));
        assert.ok(positions.every(position => position >= 0));
        assert.deepEqual(positions, [...positions].sort((a, b) => a - b));

        assert.match(body, /<td>Higher precise score<\/td><td>15\.1<\/td>/);
        assert.match(body, /<td>Lower precise score<\/td><td>15\.1<\/td>/);
      } finally {
        await new Promise<void>((resolve) => rankingServer.close(() => resolve()));
      }
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
      assert.ok(typeof jobMatches === 'string');
      assert.ok(typeof candidateMatches === 'string');
      assert.match(jobMatches, /<td>Backend Detective<\/td><td>1<\/td><td>1<\/td><td>Sherlock H\.<\/td><td>100<\/td><td>([^<]+)<\/td>/);
      assert.match(candidateMatches, /<td>1<\/td><td>Sherlock H\.<\/td><td>1<\/td><td>1<\/td><td>Backend Detective<\/td><td>100<\/td><td>([^<]+)<\/td>/);
    });
  });

  // --------------------------------------------------------------------------
  // Semantic matching output
  // --------------------------------------------------------------------------

  describe('Match response shape', () => {
    it('does not expose internal scoring details', async () => {
      const { body, headers } = await makeRequest(server, '/jobs/1/matches');
      assert.equal(String(headers['content-type']).split(';')[0], 'text/html');
      assert.ok(typeof body === 'string');
      assert.match(body, /<table>/);
      assert.doesNotMatch(body, /scoreBreakdown|semanticMatching|availabilityAlignment|preferenceAlignment/);
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

    assert.ok(typeof body === 'string');

    // The failed provider does not prevent exact matches or the HTML response.
    assert.match(body, /<td>Backend Detective<\/td><td>1<\/td><td>1<\/td><td>Sherlock H\.<\/td><td>100<\/td>/);
    assert.match(body, /<td>Ron S\.<\/td>/);
  });
});
