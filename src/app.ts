/**
 * Express application setup.
 *
 * Creates and configures the Express app with routes, middleware,
 * and service dependencies.
 */

import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import {
  MatchingService,
  NotFoundError,
  type CandidateMatchesResponse,
  type JobMatchesResponse,
} from './services/matching.service.js';

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return parsed > 0 && parsed <= 2147483647 ? parsed : null;
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toHtmlTable(
  title: string,
  headers: string[],
  rows: Array<Array<string | number>>
): string {
  const headerCells = headers.map(header => `<th scope="col">${escapeHtml(header)}</th>`).join('');
  const bodyRows = rows.map(row =>
    `<tr>${row.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`
  ).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; color: #172033; }
    h1 { font-size: 1.5rem; }
    .table-wrap { overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d5dbe5; padding: 0.65rem; text-align: left; }
    th { background: #f0f3f8; }
    tbody tr:nth-child(even) { background: #f8f9fb; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <div class="table-wrap">
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>
${bodyRows}
        </tbody>
      </table>
    </div>
  </main>
</body>
</html>`;
}

function jobMatchesHtml(response: JobMatchesResponse): string {
  return toHtmlTable(
    `Candidates for ${response.jobTitle}`,
    ['Job ID', 'Job Title', 'Rank', 'Candidate ID', 'Candidate Name', 'Score', 'Reason'],
    response.matches.map((match, index) => [
      response.jobId,
      response.jobTitle,
      index + 1,
      match.candidateId,
      match.candidateName,
      match.score,
      match.reason,
    ])
  );
}

function candidateMatchesHtml(response: CandidateMatchesResponse): string {
  return toHtmlTable(
    `Jobs for ${response.candidateName}`,
    ['Candidate ID', 'Candidate Name', 'Rank', 'Job ID', 'Job Title', 'Score', 'Reason'],
    response.matches.map((match, index) => [
      response.candidateId,
      response.candidateName,
      index + 1,
      match.jobId,
      match.jobTitle,
      match.score,
      match.reason,
    ])
  );
}

export function createApp(matchingService: MatchingService): Express {
  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/jobs/:id/matches', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const jobId = parsePositiveInt(req.params.id);
      if (jobId === null) {
        res.status(400).json({
          error: 'Invalid job ID',
          message: 'Job ID must be a positive integer.',
        });
        return;
      }

      const matches = await matchingService.getJobMatches(jobId);
      res.type('html').send(jobMatchesHtml(matches));
    } catch (error) {
      next(error);
    }
  });

  app.get('/candidates/:id/matches', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const candidateId = parsePositiveInt(req.params.id);
      if (candidateId === null) {
        res.status(400).json({
          error: 'Invalid candidate ID',
          message: 'Candidate ID must be a positive integer.',
        });
        return;
      }

      const matches = await matchingService.getCandidateMatches(candidateId);
      res.type('html').send(candidateMatchesHtml(matches));
    } catch (error) {
      next(error);
    }
  });

  // 404 for unmatched routes
  app.use((_req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested endpoint does not exist.',
    });
  });

  // Centralized error handler (must be last)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof NotFoundError) {
      res.status(404).json({
        error: 'Not Found',
        message: err.message,
      });
      return;
    }

    console.error('Unhandled error:', err.message);
    if (process.env['NODE_ENV'] === 'development') {
      console.error(err.stack);
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred. Please try again later.',
    });
  });

  return app;
}
