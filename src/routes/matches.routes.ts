/**
 * Match routes
 *
 * GET /jobs/:id/matches    - Candidates ranked for a job
 * GET /candidates/:id/matches - Jobs ranked for a candidate
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { MatchingService } from '../services/matching.service.js';

/**
 * Validate that a route parameter is a positive integer.
 * Returns the parsed integer or null if invalid.
 */
function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  // Must be all digits (no decimals, no negatives, no leading zeros except "0")
  if (!/^\d+$/.test(value)) return null;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed <= 0) return null;
  if (parsed > 2147483647) return null; // MySQL INT max
  return parsed;
}

export function createMatchRoutes(matchingService: MatchingService): Router {
  const router = Router();

  /**
   * GET /jobs/:id/matches
   * Returns candidates ranked for the specified job.
   */
  router.get('/jobs/:id/matches', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = parsePositiveInt(req.params.id);
      if (jobId === null) {
        res.status(400).json({
          error: 'Invalid job ID',
          message: 'Job ID must be a positive integer.',
        });
        return;
      }

      const result = await matchingService.getJobMatches(jobId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /candidates/:id/matches
   * Returns jobs ranked for the specified candidate.
   */
  router.get('/candidates/:id/matches', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const candidateId = parsePositiveInt(req.params.id);
      if (candidateId === null) {
        res.status(400).json({
          error: 'Invalid candidate ID',
          message: 'Candidate ID must be a positive integer.',
        });
        return;
      }

      const result = await matchingService.getCandidateMatches(candidateId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

