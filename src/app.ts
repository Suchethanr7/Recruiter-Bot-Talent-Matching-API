/**
 * Express application setup.
 *
 * Creates and configures the Express app with routes, middleware,
 * and service dependencies.
 */

import express, { type Express } from 'express';
import { createMatchRoutes } from './routes/matches.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import type { MatchingService } from './services/matching.service.js';

export function createApp(matchingService: MatchingService): Express {
  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Match routes
  app.use(createMatchRoutes(matchingService));

  // 404 for unmatched routes
  app.use((_req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested endpoint does not exist.',
    });
  });

  // Centralized error handler (must be last)
  app.use(errorHandler);

  return app;
}

