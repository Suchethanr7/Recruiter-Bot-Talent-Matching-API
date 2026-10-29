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

import type { MatchingRepository, CandidateWithSkills, JobWithSkills } from '../repositories/matching.repository.js';
import type { SemanticMatchingService } from './semantic-matching.service.js';
import { calculateMatch, normalizeSkillLabel, roundScore, type MatchResult, type SemanticMapping } from './scoring.js';

// ============================================================================
// Types
// ============================================================================

export interface JobMatchResult {
  candidateId: number;
  candidateName: string;
  score: number;
  scoreBreakdown: {
    skillScore: number;
    experienceScore: number;
  };
  skills: MatchResult['skills'];
  experience: MatchResult['experience'];
  semanticMatching: MatchResult['semanticMatching'];
  reason: string;
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
  scoreBreakdown: {
    skillScore: number;
    experienceScore: number;
  };
  skills: MatchResult['skills'];
  experience: MatchResult['experience'];
  semanticMatching: MatchResult['semanticMatching'];
  reason: string;
}

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

    // 2. Get all candidates with skills (batch query)
    const candidates = await this.repository.getAllCandidatesWithSkills();

    // 3. Score each candidate
    const scoredCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const result = await this.scoreCandidate(candidate.skills, jobSkills, candidate.experience, job.minExperience);
        return {
          candidateId: candidate.id,
          candidateName: candidate.name,
          ...result,
        };
      })
    );

    // 4. Rank candidates
    const ranked = this.rankCandidates(scoredCandidates);

    return {
      jobId: job.id,
      jobTitle: job.title,
      matches: ranked,
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

    // 2. Get all jobs with skills (batch query)
    const jobs = await this.repository.getAllJobsWithSkills();

    // 3. Score each job
    const scoredJobs = await Promise.all(
      jobs.map(async (job) => {
        const result = await this.scoreCandidate(candidateSkills, job.requiredSkills, candidate.experience, job.minExperience);
        return {
          jobId: job.id,
          jobTitle: job.title,
          ...result,
        };
      })
    );

    // 4. Rank jobs
    const ranked = this.rankJobs(scoredJobs);

    return {
      candidateId: candidate.id,
      candidateName: candidate.name,
      matches: ranked,
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
    jobMinExperience: number
  ): Promise<{
    score: number;
    scoreBreakdown: { skillScore: number; experienceScore: number };
    skills: MatchResult['skills'];
    experience: MatchResult['experience'];
    semanticMatching: MatchResult['semanticMatching'];
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
    });

    return {
      score: roundScore(matchResult.score),
      scoreBreakdown: {
        skillScore: roundScore(matchResult.scoreBreakdown.skillScore),
        experienceScore: roundScore(matchResult.scoreBreakdown.experienceScore),
      },
      skills: matchResult.skills,
      experience: matchResult.experience,
      semanticMatching: matchResult.semanticMatching,
      reason: matchResult.reason,
    };
  }

  /**
   * Rank candidates for a job:
   * 1. Total score descending
   * 2. Number of matched required skills descending
   * 3. Candidate ID ascending
   */
  private rankCandidates(candidates: JobMatchResult[]): JobMatchResult[] {
    return candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.skills.matched !== a.skills.matched) return b.skills.matched - a.skills.matched;
      return a.candidateId - b.candidateId;
    });
  }

  /**
   * Rank jobs for a candidate:
   * 1. Total score descending
   * 2. Number of matched required skills descending
   * 3. Job ID ascending
   */
  private rankJobs(jobs: CandidateJobMatchResult[]): CandidateJobMatchResult[] {
    return jobs.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.skills.matched !== a.skills.matched) return b.skills.matched - a.skills.matched;
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

