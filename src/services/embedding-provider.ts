/**
 * Embedding provider interface and implementations.
 *
 * The EmbeddingProvider interface is the seam that keeps AI replaceable.
 * Only skill labels are sent to the provider — never candidate names,
 * quirks, or other personal data.
 *
 * Privacy note: When using a hosted provider (Google AI, OpenAI), skill
 * label text is sent over the network. Ensure your organization's policies
 * permit this.
 */

// ============================================================================
// Interface
// ============================================================================

/**
 * Minimal interface for generating text embeddings.
 * Implementations may use Google AI, OpenAI, a local model, or mocks.
 */
export interface EmbeddingProvider {
  /** Human-readable name for diagnostics */
  readonly name: string;

  /**
   * Generate embeddings for a list of text labels.
   * @param texts - Array of skill labels to embed
   * @returns Array of embedding vectors, one per input text, in the same order
   * @throws Error if the provider is unavailable or the request fails
   */
  generateEmbeddings(texts: string[]): Promise<number[][]>;
}

// ============================================================================
// Google AI (Gemini) Embedding Provider
// ============================================================================

/**
 * Google AI embedding provider using the Gemini text-embedding model.
 *
 * Uses the REST API directly (no SDK dependency needed).
 * Model: gemini-embedding-001
 *
 * Requires GOOGLE_AI_API_KEY environment variable.
 * API docs: https://ai.google.dev/gemini-api/docs/embeddings
 */
export class GoogleAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'google-ai';
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly model = 'gemini-embedding-001';

  constructor(apiKey: string, timeoutMs: number = 10000) {
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;

    const body = {
      requests: texts.map(text => ({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
        taskType: 'SEMANTIC_SIMILARITY',
      })),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `Google AI embedding request failed with status ${response.status}: ${errorText}`
        );
      }

      const data = (await response.json()) as {
        embeddings: Array<{ values: number[] }>;
      };

      if (!data.embeddings || data.embeddings.length !== texts.length) {
        throw new Error(
          `Google AI returned ${data.embeddings?.length ?? 0} embeddings for ${texts.length} inputs`
        );
      }

      return data.embeddings.map(e => e.values);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Google AI embedding request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ============================================================================
// OpenAI Embedding Provider (Alternative)
// ============================================================================

/**
 * OpenAI embedding provider using the text-embedding-3-small model.
 *
 * Requires OPENAI_API_KEY environment variable.
 * Model: text-embedding-3-small (1536 dimensions)
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly model = 'text-embedding-3-small';

  constructor(apiKey: string, timeoutMs: number = 10000) {
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: texts,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `OpenAI embedding request failed with status ${response.status}: ${errorText}`
        );
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
      };

      // OpenAI returns embeddings sorted by index
      const sorted = data.data.sort((a, b) => a.index - b.index);
      return sorted.map(d => d.embedding);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`OpenAI embedding request timed out after ${this.timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ============================================================================
// Fake Embedding Provider (Tests Only)
// ============================================================================

/**
 * Fake embedding provider for unit tests.
 * Returns predetermined vectors or generates simple deterministic ones.
 *
 * DO NOT use in production.
 */
export class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'fake';
  private readonly embeddingMap: Map<string, number[]>;
  private readonly defaultDimensions: number;
  public callCount = 0;
  public shouldFail = false;
  public failMessage = 'Fake provider failure';

  constructor(embeddingMap?: Map<string, number[]>, dimensions: number = 10) {
    this.embeddingMap = embeddingMap ?? new Map();
    this.defaultDimensions = dimensions;
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    this.callCount++;

    if (this.shouldFail) {
      throw new Error(this.failMessage);
    }

    return texts.map(text => {
      const mapped = this.embeddingMap.get(text.toLowerCase().trim());
      if (mapped) return mapped;

      // Generate a deterministic vector from the text hash
      const vec = new Array(this.defaultDimensions).fill(0);
      for (let i = 0; i < text.length; i++) {
        vec[i % this.defaultDimensions]! += text.charCodeAt(i) / 1000;
      }
      // Normalize to unit vector
      const magnitude = Math.sqrt(vec.reduce((sum: number, v: number) => sum + v * v, 0));
      return magnitude > 0 ? vec.map((v: number) => v / magnitude) : vec;
    });
  }
}

// ============================================================================
// Provider Factory
// ============================================================================

/**
 * Create an embedding provider based on configuration.
 * Returns null if the provider cannot be created (missing API key, etc.)
 */
export function createEmbeddingProvider(
  provider: string,
  config: { googleAiApiKey?: string; openaiApiKey?: string; timeoutMs?: number }
): EmbeddingProvider | null {
  const timeoutMs = config.timeoutMs ?? 10000;

  switch (provider) {
    case 'google-ai':
      if (!config.googleAiApiKey) return null;
      return new GoogleAIEmbeddingProvider(config.googleAiApiKey, timeoutMs);

    case 'openai':
      if (!config.openaiApiKey) return null;
      return new OpenAIEmbeddingProvider(config.openaiApiKey, timeoutMs);

    default:
      console.warn(`Unknown embedding provider: "${provider}"`);
      return null;
  }
}
