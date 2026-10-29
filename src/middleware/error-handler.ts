/**
 * Centralized error handling middleware.
 *
 * Converts known error types to appropriate HTTP responses.
 * Never exposes stack traces, SQL details, or credentials.
 */

import type { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../services/matching.service.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // NotFoundError → 404
  if (err instanceof NotFoundError) {
    res.status(404).json({
      error: 'Not Found',
      message: err.message,
    });
    return;
  }

  // Unexpected errors → 500 (no internals leaked)
  console.error('Unhandled error:', err.message);
  if (process.env['NODE_ENV'] === 'development') {
    console.error(err.stack);
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred. Please try again later.',
  });
}

