/**
 * Server entry point.
 *
 * Wires up all dependencies:
 *   Config → DB Pool → Repository → Semantic Service → Matching Service → App
 *
 * Handles graceful shutdown of HTTP server and DB pool.
 */

import { loadConfig } from './config/env.js';
import { createPool, closePool } from './db/pool.js';
import { MatchingRepository } from './repositories/matching.repository.js';
import { SemanticMatchingService } from './services/semantic-matching.service.js';
import { MatchingService } from './services/matching.service.js';
import { createEmbeddingProvider } from './services/embedding-provider.js';
import { createApp } from './app.js';
import type { Server } from 'http';

async function main(): Promise<void> {
  // 1. Load and validate configuration
  const config = loadConfig();

  // 2. Create database pool
  const pool = createPool(config.db);

  // Verify DB connection
  try {
    await pool.execute('SELECT 1');
    console.log(`✓ Connected to MySQL at ${config.db.host}:${config.db.port}/${config.db.database}`);
  } catch (error) {
    console.error('✗ Failed to connect to MySQL:', (error as Error).message);
    process.exit(1);
  }

  // 3. Create embedding provider (null if not configured)
  const embeddingProvider = config.semanticMatching.enabled
    ? createEmbeddingProvider(config.semanticMatching.provider, {
        googleAiApiKey: config.googleAi.apiKey,
        openaiApiKey: config.openai.apiKey,
        timeoutMs: config.semanticMatching.requestTimeoutMs,
      })
    : null;

  if (config.semanticMatching.enabled) {
    if (embeddingProvider) {
      console.log(`✓ Semantic matching enabled (provider: ${embeddingProvider.name}, threshold: ${config.semanticMatching.similarityThreshold})`);
    } else {
      console.warn('⚠ Semantic matching enabled but no provider configured — will fall back to exact matching');
    }
  } else {
    console.log('○ Semantic matching disabled');
  }

  // 4. Create services
  const repository = new MatchingRepository(pool);

  const semanticService = new SemanticMatchingService(embeddingProvider, {
    enabled: config.semanticMatching.enabled,
    similarityThreshold: config.semanticMatching.similarityThreshold,
    cacheMaxSize: config.semanticMatching.cacheMaxSize,
  });

  const matchingService = new MatchingService(repository, semanticService);

  // 5. Create and start Express app
  const app = createApp(matchingService);

  let server: Server;
  await new Promise<void>((resolve) => {
    server = app.listen(config.port, () => {
      console.log(`\n🚀 RecruiterFlow API running on http://localhost:${config.port}`);
      console.log(`   GET /jobs/:id/matches`);
      console.log(`   GET /candidates/:id/matches`);
      console.log(`   GET /health\n`);
      resolve();
    });
  });

  // 6. Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server!.close(async () => {
      await closePool();
      console.log('Server and database pool closed.');
      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

