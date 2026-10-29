/**
 * Matching Service
 *
 * Orchestrates the matching process:
 * 1. Fetches data from the repository (DB)
 * 2. Identifies exact matches
 * 3. Uses semantic matching for unresolved skills (if enabled)
 * 4. Calls the pure scoring algorithm
 * 5. Ranks and returns results
 *
 * Both endpoints use this single service to ensure consistent scoring.
 */

import type {
  MatchingRepository,
  CandidateWithSkills,
  JobWithSkills,
  CandidatePreference,
  JobPreference,
} from '../repositories/matching.repository.js';
import type { SemanticMatchingService } from './semantic-matching.service.js';
import { calculateMatch, normalizeSkillLabel, roundScore, type MatchResult, type SemanticMapping } from './scoring.js';

// ============================================================================
// Types
// ============================================================================

export interface JobMatchResult {
  candidateId: number;
  candidateName: string;
  score: number;
  reason: string;
}

interface RankedJobMatch extends JobMatchResult {
  rankingScore: number;
  matchedSkills: number;
}

export interface JobMatchesResponse {
  jobId: number;
  jobTitle: string;
  matches: JobMatchResult[];
}

export interface CandidateJobMatchResult {
  jobId: number;
  jobTitle: string;
  score: number;
  reason: string;
}

interface RankedCandidateJobMatch extends CandidateJobMatchResult {
  rankingScore: number;
  matchedSkills: number;
}

const SCORE_TIE_TOLERANCE = 1e-9;

export interface CandidateMatchesResponse {
  candidateId: number;
  candidateName: string;
  matches: CandidateJobMatchResult[];
}

// ============================================================================
// Service
// ============================================================================

export class MatchingService {
  constructor(
    private readonly repository: MatchingRepository,
    private readonly semanticService: SemanticMatchingService
  ) {}

  /**
   * GET /jobs/:id/matches
   * Rank all candidates for a specific job.
   */
  async getJobMatches(jobId: number): Promise<JobMatchesResponse> {
    // 1. Get job data
    const job = await this.repository.getJobById(jobId);
    if (!job) {
      throw new NotFoundError(`Job with ID ${jobId} not found`);
    }

    const jobSkills = await this.repository.getJobRequiredSkills(jobId);
    const jobPreferences = await this.repository.getJobPreferences(jobId);

    // 2. Get all candidates with skills (batch query)
    const candidates = await this.repository.getAllCandidatesWithSkills();

    // 3. Score each candidate
    const scoredCandidates: RankedJobMatch[] = await Promise.all(
      candidates.map(async (candidate) => {
        const result = await this.scoreCandidate(
          candidate.skills,
          jobSkills,
          candidate.experience,
          job.minExperience,
          candidate.availability,
          job.availabilityRequirement,
          candidate.preferences,
          jobPreferences
        );
        const { matchedSkills, ...match } = result;
        return {
          candidateId: candidate.id,
          candidateName: candidate.name,
          ...match,
          matchedSkills,
        };
      })
    );

    // 4. Rank candidates
    const ranked = this.rankCandidates(scoredCandidates);

    return {
      jobId: job.id,
      jobTitle: job.title,
      matches: ranked.map(({ candidateId, candidateName, score, reason }) => ({
        candidateId,
        candidateName,
        score,
        reason,
      })),
    };
  }

  /**
   * GET /candidates/:id/matches
   * Rank all jobs for a specific candidate.
   */
  async getCandidateMatches(candidateId: number): Promise<CandidateMatchesResponse> {
    // 1. Get candidate data
    const candidate = await this.repository.getCandidateById(candidateId);
    if (!candidate) {
      throw new NotFoundError(`Candidate with ID ${candidateId} not found`);
    }

    const candidateSkills = await this.repository.getCandidateSkills(candidateId);
    const candidatePreferences = await this.repository.getCandidatePreferences(candidateId);

    // 2. Get all jobs with skills (batch query)
    const jobs = await this.repository.getAllJobsWithSkills();

    // 3. Score each job
    const scoredJobs: RankedCandidateJobMatch[] = await Promise.all(
      jobs.map(async (job) => {
        const result = await this.scoreCandidate(
          candidateSkills,
          job.requiredSkills,
          candidate.experience,
          job.minExperience,
          candidate.availability,
          job.availabilityRequirement,
          candidatePreferences,
          job.preferences
        );
        const { matchedSkills, ...match } = result;
        return {
          jobId: job.id,
          jobTitle: job.title,
          ...match,
          matchedSkills,
        };
      })
    );

    // 4. Rank jobs
    const ranked = this.rankJobs(scoredJobs);

    return {
      candidateId: candidate.id,
      candidateName: candidate.name,
      matches: ranked.map(({ jobId, jobTitle, score, reason }) => ({
        jobId,
        jobTitle,
        score,
        reason,
      })),
    };
  }

  /**
   * Core scoring: used by both endpoints.
   * 1. Exact match first
   * 2. Semantic matching for unresolved skills
   * 3. Calculate scores using pure scoring function
   */
  private async scoreCandidate(
    candidateSkills: string[],
    jobRequiredSkills: string[],
    candidateExperience: number,
    jobMinExperience: number,
    candidateAvailability: string,
    jobAvailabilityRequirement: string | null,
    candidatePreferences: CandidatePreference[],
    jobPreferences: JobPreference[]
  ): Promise<{
    score: number;
    rankingScore: number;
    matchedSkills: number;
    reason: string;
  }> {
    // Find exact matches to determine unresolved skills
    const normalizedRequired = jobRequiredSkills.map(normalizeSkillLabel);
    const normalizedCandidate = candidateSkills.map(normalizeSkillLabel);

    const unresolvedRequired: string[] = [];
    const unresolvedCandidate: string[] = [];
    const exactMatchedCandidateNorm = new Set<string>();

    for (const reqNorm of normalizedRequired) {
      if (normalizedCandidate.includes(reqNorm)) {
        exactMatchedCandidateNorm.add(reqNorm);
      } else {
        // Find the original label for this unresolved required skill
        const origIdx = jobRequiredSkills.findIndex(
          (s, i) => normalizeSkillLabel(s) === reqNorm && !unresolvedRequired.includes(jobRequiredSkills[i]!)
        );
        if (origIdx !== -1) {
          unresolvedRequired.push(jobRequiredSkills[origIdx]!);
        }
      }
    }

    for (let i = 0; i < candidateSkills.length; i++) {
      const normSkill = normalizedCandidate[i]!;
      if (!exactMatchedCandidateNorm.has(normSkill)) {
        unresolvedCandidate.push(candidateSkills[i]!);
      }
    }

    // Get semantic mappings for unresolved skills only
    const semanticResult = await this.semanticService.findSemanticMappings(
      unresolvedCandidate,
      unresolvedRequired
    );

    // Calculate match using pure scoring function
    const matchResult = calculateMatch({
      candidateSkills,
      jobRequiredSkills,
      candidateExperience,
      jobMinExperience,
      semanticMappings: semanticResult.mappings,
      semanticMatchingStatus: semanticResult.status,
      candidateAvailability,
      jobAvailabilityRequirement,
      candidatePreferences,
      jobPreferences,
    });

    return {
      score: roundScore(matchResult.score),
      rankingScore: matchResult.score,
      matchedSkills: matchResult.skills.matched,
      reason: matchResult.reason,
    };
  }

  /**
   * Rank candidates for a job:
   * 1. Full-precision total score descending (display rounding does not affect rank)
   * 2. Number of matched required skills descending
   * 3. Candidate ID ascending
   */
  private rankCandidates(candidates: RankedJobMatch[]): RankedJobMatch[] {
    return candidates.sort((a, b) => {
      const scoreDifference = b.rankingScore - a.rankingScore;
      if (Math.abs(scoreDifference) > SCORE_TIE_TOLERANCE) return scoreDifference;
      if (b.matchedSkills !== a.matchedSkills) return b.matchedSkills - a.matchedSkills;
      return a.candidateId - b.candidateId;
    });
  }

  /**
   * Rank jobs for a candidate:
   * 1. Full-precision total score descending (display rounding does not affect rank)
   * 2. Number of matched required skills descending
   * 3. Job ID ascending
   */
  private rankJobs(jobs: RankedCandidateJobMatch[]): RankedCandidateJobMatch[] {
    return jobs.sort((a, b) => {
      const scoreDifference = b.rankingScore - a.rankingScore;
      if (Math.abs(scoreDifference) > SCORE_TIE_TOLERANCE) return scoreDifference;
      if (b.matchedSkills !== a.matchedSkills) return b.matchedSkills - a.matchedSkills;
      return a.jobId - b.jobId;
    });
  }
}

// ============================================================================
// Custom Errors
// ============================================================================

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
