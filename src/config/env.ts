import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  port: number;
  nodeEnv: string;
  db: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
  };
  semanticMatching: {
    enabled: boolean;
    provider: string;
    similarityThreshold: number;
    cacheMaxSize: number;
    requestTimeoutMs: number;
  };
  googleAi: {
    apiKey: string | undefined;
  };
  openai: {
    apiKey: string | undefined;
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, defaultValue: string): string {
  return process.env[name] ?? defaultValue;
}

function parseBool(value: string): boolean {
  return value.toLowerCase() === 'true' || value === '1';
}

function parseIntSafe(value: string, name: string): number {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer, got: "${value}"`);
  }
  return parsed;
}

function parseFloatSafe(value: string, name: string): number {
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0 || parsed > 1) {
    throw new Error(`Environment variable ${name} must be a number between 0 and 1, got: "${value}"`);
  }
  return parsed;
}

export function loadConfig(): AppConfig {
  const semanticEnabled = parseBool(optionalEnv('SEMANTIC_MATCHING_ENABLED', 'false'));
  const provider = optionalEnv('EMBEDDING_PROVIDER', 'google-ai');

  // Only require API keys when semantic matching is enabled
  if (semanticEnabled) {
    if (provider === 'google-ai' && !process.env['GOOGLE_AI_API_KEY']) {
      console.warn(
        'WARNING: SEMANTIC_MATCHING_ENABLED=true but GOOGLE_AI_API_KEY is not set. ' +
        'Semantic matching will fall back to exact matching if embeddings cannot be generated.'
      );
    }
    if (provider === 'openai' && !process.env['OPENAI_API_KEY']) {
      console.warn(
        'WARNING: SEMANTIC_MATCHING_ENABLED=true but OPENAI_API_KEY is not set. ' +
        'Semantic matching will fall back to exact matching if embeddings cannot be generated.'
      );
    }
  }

  return {
    port: parseIntSafe(optionalEnv('PORT', '3000'), 'PORT'),
    nodeEnv: optionalEnv('NODE_ENV', 'development'),
    db: {
      host: requiredEnv('DB_HOST'),
      port: parseIntSafe(optionalEnv('DB_PORT', '3306'), 'DB_PORT'),
      user: requiredEnv('DB_USER'),
      password: requiredEnv('DB_PASSWORD'),
      database: requiredEnv('DB_NAME'),
    },
    semanticMatching: {
      enabled: semanticEnabled,
      provider,
      similarityThreshold: parseFloatSafe(
        optionalEnv('SEMANTIC_SIMILARITY_THRESHOLD', '0.82'),
        'SEMANTIC_SIMILARITY_THRESHOLD'
      ),
      cacheMaxSize: parseIntSafe(
        optionalEnv('EMBEDDING_CACHE_MAX_SIZE', '500'),
        'EMBEDDING_CACHE_MAX_SIZE'
      ),
      requestTimeoutMs: parseIntSafe(
        optionalEnv('EMBEDDING_REQUEST_TIMEOUT_MS', '10000'),
        'EMBEDDING_REQUEST_TIMEOUT_MS'
      ),
    },
    googleAi: {
      apiKey: process.env['GOOGLE_AI_API_KEY'],
    },
    openai: {
      apiKey: process.env['OPENAI_API_KEY'],
    },
  };
}

