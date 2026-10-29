/**
 * Semantic Skill Matching Service
 *
 * Uses text embeddings and cosine similarity to identify potentially
 * equivalent skills with different labels (e.g., "system design" ≈ "systems-design").
 *
 * Key design principles:
 * - Exact matches always take precedence (handled in scoring.ts)
 * - Conservative: only accepts high-confidence semantic matches
 * - Bounded in-memory cache to avoid repeated API calls
 * - Graceful fallback when the AI provider is unavailable
 * - One-to-one mapping: each skill satisfies at most one requirement
 * - Deterministic: same inputs always produce same mappings
 *
 * Threshold configuration:
 * - The default threshold (0.82) is a starting value, NOT empirically optimized
 * - Lower thresholds increase recall but risk false positives
 *   (e.g., treating "leadership" and "mentorship" as equivalent)
 * - Higher thresholds increase precision but miss legitimate equivalences
 *   (e.g., missing "REST API development" ≈ "RESTful API design")
 * - Evaluate on your specific skill vocabulary before production use
 */

import type { EmbeddingProvider } from './embedding-provider.js';
import type { SemanticMapping } from './scoring.js';

// ============================================================================
// Types
// ============================================================================

export interface SemanticMatchingConfig {
  enabled: boolean;
  similarityThreshold: number;
  cacheMaxSize: number;
}

export interface SemanticMatchingResult {
  mappings: SemanticMapping[];
  status: 'enabled' | 'disabled' | 'unavailable';
}

// ============================================================================
// Bounded LRU-like Cache
// ============================================================================

/**
 * Simple bounded cache for embedding vectors.
 * When the cache exceeds maxSize, the oldest entries are evicted (FIFO).
 * This is not a distributed cache — it lives in process memory.
 *
 * Limitations:
 * - Not shared across server instances
 * - Lost on server restart
 * - FIFO eviction, not true LRU (simpler implementation)
 */
class EmbeddingCache {
  private readonly cache = new Map<string, number[]>();
  private readonly maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  get(key: string): number[] | undefined {
    return this.cache.get(key);
  }

  set(key: string, value: number[]): void {
    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }
    this.cache.set(key, value);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  get size(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

// ============================================================================
// Cosine Similarity
// ============================================================================

/**
 * Calculate cosine similarity between two vectors.
 * Returns a value between -1 and 1, where 1 means identical direction.
 * For normalized embedding vectors, this is equivalent to the dot product.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  if (a.length === 0) return 0;

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    magnitudeA += a[i]! * a[i]!;
    magnitudeB += b[i]! * b[i]!;
  }

  const magnitude = Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

// ============================================================================
// Semantic Matching Service
// ============================================================================

export class SemanticMatchingService {
  private readonly provider: EmbeddingProvider | null;
  private readonly config: SemanticMatchingConfig;
  private readonly cache: EmbeddingCache;

  constructor(provider: EmbeddingProvider | null, config: SemanticMatchingConfig) {
    this.provider = provider;
    this.config = config;
    this.cache = new EmbeddingCache(config.cacheMaxSize);
  }

  /**
   * Find semantic mappings between unresolved candidate skills and
   * unresolved required skills.
   *
   * IMPORTANT: Only call this with skills that did NOT already match exactly.
   * Exact matching is handled in scoring.ts before this is called.
   *
   * @param unresolvedCandidateSkills - Candidate skills with no exact match
   * @param unresolvedRequiredSkills - Required skills with no exact match
   * @returns Accepted semantic mappings and status
   */
  async findSemanticMappings(
    unresolvedCandidateSkills: string[],
    unresolvedRequiredSkills: string[]
  ): Promise<SemanticMatchingResult> {
    // Short-circuit: disabled
    if (!this.config.enabled) {
      return { mappings: [], status: 'disabled' };
    }

    // Short-circuit: no provider available
    if (!this.provider) {
      return { mappings: [], status: 'unavailable' };
    }

    // Short-circuit: nothing to match
    if (unresolvedCandidateSkills.length === 0 || unresolvedRequiredSkills.length === 0) {
      return { mappings: [], status: 'enabled' };
    }

    try {
      // Get embeddings for all skills (using cache where possible)
      const allSkills = [...new Set([...unresolvedCandidateSkills, ...unresolvedRequiredSkills])];
      const embeddings = await this.getEmbeddings(allSkills);

      // Build similarity matrix
      const similarities: Array<{
        candidateSkill: string;
        requiredSkill: string;
        similarity: number;
      }> = [];

      for (const candSkill of unresolvedCandidateSkills) {
        const candEmb = embeddings.get(candSkill);
        if (!candEmb) continue;

        for (const reqSkill of unresolvedRequiredSkills) {
          const reqEmb = embeddings.get(reqSkill);
          if (!reqEmb) continue;

          const similarity = cosineSimilarity(candEmb, reqEmb);

          // Only consider pairs above the threshold
          if (similarity >= this.config.similarityThreshold) {
            similarities.push({
              candidateSkill: candSkill,
              requiredSkill: reqSkill,
              similarity,
            });
          }
        }
      }

      // Greedy one-to-one assignment
      const mappings = this.assignMappings(similarities);

      return { mappings, status: 'enabled' };
    } catch (error: unknown) {
      // Provider failure: fall back to no semantic matches
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Semantic matching provider error: ${message}`);
      return { mappings: [], status: 'unavailable' };
    }
  }

  /**
   * Get embeddings for a list of skill labels, using cache where possible.
   * Only calls the provider for uncached labels.
   */
  private async getEmbeddings(skills: string[]): Promise<Map<string, number[]>> {
    const result = new Map<string, number[]>();
    const uncached: string[] = [];

    // Check cache first
    for (const skill of skills) {
      const cached = this.cache.get(skill.toLowerCase().trim());
      if (cached) {
        result.set(skill, cached);
      } else {
        uncached.push(skill);
      }
    }

    // Fetch uncached embeddings from provider
    if (uncached.length > 0 && this.provider) {
      const embeddings = await this.provider.generateEmbeddings(uncached);

      for (let i = 0; i < uncached.length; i++) {
        const skill = uncached[i]!;
        const embedding = embeddings[i]!;
        this.cache.set(skill.toLowerCase().trim(), embedding);
        result.set(skill, embedding);
      }
    }

    return result;
  }

  /**
   * Greedy one-to-one assignment of semantic mappings.
   *
   * Algorithm:
   * 1. Sort all candidate pairs by similarity descending
   * 2. Tie-break deterministically: by required skill name, then candidate skill name
   * 3. Greedily assign the highest-similarity valid pair
   * 4. Mark both skills as consumed
   *
   * This is optimal for small datasets. For larger datasets, the
   * Hungarian algorithm would guarantee globally optimal assignment,
   * but greedy is simpler and sufficient here.
   */
  private assignMappings(
    similarities: Array<{
      candidateSkill: string;
      requiredSkill: string;
      similarity: number;
    }>
  ): SemanticMapping[] {
    // Sort: highest similarity first, then deterministic tie-breaking
    const sorted = [...similarities].sort((a, b) => {
      if (b.similarity !== a.similarity) return b.similarity - a.similarity;
      if (a.requiredSkill < b.requiredSkill) return -1;
      if (a.requiredSkill > b.requiredSkill) return 1;
      if (a.candidateSkill < b.candidateSkill) return -1;
      if (a.candidateSkill > b.candidateSkill) return 1;
      return 0;
    });

    const usedRequired = new Set<string>();
    const usedCandidate = new Set<string>();
    const mappings: SemanticMapping[] = [];

    for (const pair of sorted) {
      if (usedRequired.has(pair.requiredSkill) || usedCandidate.has(pair.candidateSkill)) {
        continue;
      }

      mappings.push({
        candidateSkill: pair.candidateSkill,
        requiredSkill: pair.requiredSkill,
        similarity: pair.similarity,
      });
      usedRequired.add(pair.requiredSkill);
      usedCandidate.add(pair.candidateSkill);
    }

    return mappings;
  }

  /** Clear the embedding cache. Useful for testing. */
  clearCache(): void {
    this.cache.clear();
  }

  /** Get current cache size. Useful for diagnostics. */
  getCacheSize(): number {
    return this.cache.size;
  }
}

