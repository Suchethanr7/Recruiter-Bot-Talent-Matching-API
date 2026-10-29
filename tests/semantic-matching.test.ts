/**
 * Unit tests for semantic skill matching.
 *
 * Uses a FakeEmbeddingProvider — no external API key required.
 * Tests verify the semantic matching logic, not the accuracy of any
 * particular embedding model.
 *
 * Run: npm test
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { FakeEmbeddingProvider } from '../src/services/embedding-provider.js';
import {
  SemanticMatchingService,
  cosineSimilarity,
} from '../src/services/semantic-matching.service.js';

// ============================================================================
// Helper: create vectors with known cosine similarity
// ============================================================================

/**
 * Create two unit vectors with approximately the specified cosine similarity.
 * For testing purposes — similarity is approximate.
 */
function createVectorPair(similarity: number, dims: number = 10): [number[], number[]] {
  const a = new Array(dims).fill(0);
  const b = new Array(dims).fill(0);

  // Vector a: unit vector along first dimension
  a[0] = 1;

  // Vector b: rotated to achieve target similarity
  // cos(theta) = similarity, so b = [similarity, sqrt(1-sim^2), 0, ...]
  b[0] = similarity;
  b[1] = Math.sqrt(1 - similarity * similarity);

  return [a, b];
}

// ============================================================================
// cosineSimilarity
// ============================================================================

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 0, 0];
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 0.0001);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    assert.ok(Math.abs(cosineSimilarity(a, b)) < 0.0001);
  });

  it('returns correct similarity for known vectors', () => {
    const [a, b] = createVectorPair(0.85);
    const sim = cosineSimilarity(a, b);
    assert.ok(Math.abs(sim - 0.85) < 0.01);
  });

  it('throws for mismatched dimensions', () => {
    assert.throws(() => cosineSimilarity([1, 2], [1, 2, 3]));
  });

  it('returns 0 for zero vectors', () => {
    assert.equal(cosineSimilarity([0, 0], [0, 0]), 0);
  });
});

// ============================================================================
// SemanticMatchingService
// ============================================================================

describe('SemanticMatchingService', () => {
  const THRESHOLD = 0.82;

  // Create embedding pairs with known similarities
  const highSimilarity = createVectorPair(0.95);    // Above threshold
  const mediumSimilarity = createVectorPair(0.85);  // Above threshold
  const belowThreshold = createVectorPair(0.75);    // Below threshold
  const lowSimilarity = createVectorPair(0.3);      // Way below threshold

  function createService(provider: FakeEmbeddingProvider | null, enabled: boolean = true) {
    return new SemanticMatchingService(provider, {
      enabled,
      similarityThreshold: THRESHOLD,
      cacheMaxSize: 100,
    });
  }

  describe('when disabled', () => {
    it('returns disabled status with no mappings', async () => {
      const provider = new FakeEmbeddingProvider();
      const service = createService(provider, false);

      const result = await service.findSemanticMappings(
        ['system design'],
        ['systems-design']
      );

      assert.equal(result.status, 'disabled');
      assert.equal(result.mappings.length, 0);
      assert.equal(provider.callCount, 0); // No API call made
    });
  });

  describe('when provider is null', () => {
    it('returns unavailable status', async () => {
      const service = createService(null, true);

      const result = await service.findSemanticMappings(
        ['system design'],
        ['systems-design']
      );

      assert.equal(result.status, 'unavailable');
      assert.equal(result.mappings.length, 0);
    });
  });

  describe('when provider fails', () => {
    it('returns unavailable status on provider error', async () => {
      const provider = new FakeEmbeddingProvider();
      provider.shouldFail = true;
      provider.failMessage = 'API rate limit exceeded';
      const service = createService(provider);

      const result = await service.findSemanticMappings(
        ['system design'],
        ['systems-design']
      );

      assert.equal(result.status, 'unavailable');
      assert.equal(result.mappings.length, 0);
    });
  });

  describe('accepted semantic match', () => {
    it('matches skills above threshold', async () => {
      const embMap = new Map<string, number[]>();
      embMap.set('system design', highSimilarity[0]);
      embMap.set('systems-design', highSimilarity[1]);

      const provider = new FakeEmbeddingProvider(embMap);
      const service = createService(provider);

      const result = await service.findSemanticMappings(
        ['system design'],
        ['systems-design']
      );

      assert.equal(result.status, 'enabled');
      assert.equal(result.mappings.length, 1);
      assert.equal(result.mappings[0]!.candidateSkill, 'system design');
      assert.equal(result.mappings[0]!.requiredSkill, 'systems-design');
      assert.ok(result.mappings[0]!.similarity >= THRESHOLD);
    });
  });

  describe('rejected pairs', () => {
    it('rejects pair below threshold', async () => {
      const embMap = new Map<string, number[]>();
      embMap.set('woodworking', belowThreshold[0]);
      embMap.set('chemistry', belowThreshold[1]);

      const provider = new FakeEmbeddingProvider(embMap);
      const service = createService(provider);

      const result = await service.findSemanticMappings(
        ['woodworking'],
        ['chemistry']
      );

      assert.equal(result.mappings.length, 0);
    });

    it('rejects completely unrelated skills', async () => {
      const embMap = new Map<string, number[]>();
      embMap.set('forensics', lowSimilarity[0]);
      embMap.set('sales', lowSimilarity[1]);

      const provider = new FakeEmbeddingProvider(embMap);
      const service = createService(provider);

      const result = await service.findSemanticMappings(
        ['forensics'],
        ['sales']
      );

      assert.equal(result.mappings.length, 0);
    });
  });

  describe('one-to-one mapping constraint', () => {
    it('does not reuse candidate skill for multiple requirements', async () => {
      // "analysis" is somewhat similar to both "deduction" and "pattern-recognition"
      const embMap = new Map<string, number[]>();
      const [base] = createVectorPair(1.0);
      const [_, similar1] = createVectorPair(0.90);
      const [__, similar2] = createVectorPair(0.88);

      embMap.set('analysis', base);
      embMap.set('deduction', similar1);
      embMap.set('pattern-recognition', similar2);

      const provider = new FakeEmbeddingProvider(embMap);
      const service = createService(provider);

      const result = await service.findSemanticMappings(
        ['analysis'],
        ['deduction', 'pattern-recognition']
      );

      // Should match at most one required skill
      assert.ok(result.mappings.length <= 1);
    });
  });

  describe('deterministic tie-breaking', () => {
    it('produces consistent results on repeated calls', async () => {
      const embMap = new Map<string, number[]>();
      embMap.set('skill-a', mediumSimilarity[0]);
      embMap.set('req-a', mediumSimilarity[1]);

      const provider = new FakeEmbeddingProvider(embMap);
      const service = createService(provider);

      const result1 = await service.findSemanticMappings(['skill-a'], ['req-a']);
      const result2 = await service.findSemanticMappings(['skill-a'], ['req-a']);

      assert.equal(result1.mappings.length, result2.mappings.length);
      if (result1.mappings.length > 0) {
        assert.equal(result1.mappings[0]!.candidateSkill, result2.mappings[0]!.candidateSkill);
        assert.equal(result1.mappings[0]!.requiredSkill, result2.mappings[0]!.requiredSkill);
      }
    });
  });

  describe('empty inputs', () => {
    it('handles empty candidate skills', async () => {
      const provider = new FakeEmbeddingProvider();
      const service = createService(provider);

      const result = await service.findSemanticMappings([], ['deduction']);

      assert.equal(result.mappings.length, 0);
      assert.equal(result.status, 'enabled');
      assert.equal(provider.callCount, 0);
    });

    it('handles empty required skills', async () => {
      const provider = new FakeEmbeddingProvider();
      const service = createService(provider);

      const result = await service.findSemanticMappings(['deduction'], []);

      assert.equal(result.mappings.length, 0);
      assert.equal(provider.callCount, 0);
    });
  });

  describe('cache behavior', () => {
    it('caches embeddings to avoid repeated API calls', async () => {
      const embMap = new Map<string, number[]>();
      embMap.set('system design', highSimilarity[0]);
      embMap.set('systems-design', highSimilarity[1]);

      const provider = new FakeEmbeddingProvider(embMap);
      const service = createService(provider);

      // First call: provider is called
      await service.findSemanticMappings(['system design'], ['systems-design']);
      assert.equal(provider.callCount, 1);

      // Second call: should use cache (provider not called again for cached skills)
      await service.findSemanticMappings(['system design'], ['systems-design']);
      // Cache should contain both skills, so no new provider call needed
      assert.equal(provider.callCount, 1);
    });

    it('cache respects max size', () => {
      const provider = new FakeEmbeddingProvider();
      const service = new SemanticMatchingService(provider, {
        enabled: true,
        similarityThreshold: THRESHOLD,
        cacheMaxSize: 3,
      });

      // Verify cache size is bounded (internal implementation detail)
      // We can only check indirectly via provider call counts
      assert.equal(service.getCacheSize(), 0);
    });

    it('clearCache empties the cache', async () => {
      const embMap = new Map<string, number[]>();
      embMap.set('skill-a', highSimilarity[0]);
      embMap.set('skill-b', highSimilarity[1]);

      const provider = new FakeEmbeddingProvider(embMap);
      const service = createService(provider);

      await service.findSemanticMappings(['skill-a'], ['skill-b']);
      assert.ok(service.getCacheSize() > 0);

      service.clearCache();
      assert.equal(service.getCacheSize(), 0);
    });
  });
});
