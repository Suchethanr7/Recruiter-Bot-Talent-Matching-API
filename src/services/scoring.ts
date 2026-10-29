/**
 * Pure scoring algorithm for candidate-job matching.
 *
 * This module has NO dependencies on Express, MySQL, AI providers, or network access.
 * All functions are pure: given the same inputs, they always produce the same outputs.
 *
 * Scoring weights (transparent baseline, not empirically optimized):
 *   - Skill matching:  70 points (70%)
 *   - Experience fit:  30 points (30%)
 *   - Total:          100 points
 */

// ============================================================================
// Types
// ============================================================================

export type MatchType = 'exact' | 'semantic';

export interface MatchedSkill {
  requiredSkill: string;
  candidateSkill: string;
  matchType: MatchType;
  /** Cosine similarity score for semantic matches (0-1). Undefined for exact. */
  similarity?: number;
}

export interface SkillMatchResult {
  required: number;
  exactMatches: number;
  semanticMatches: number;
  matched: number;
  matchedSkills: MatchedSkill[];
  missingSkills: string[];
}

export interface ExperienceResult {
  candidateYears: number;
  minimumRequiredYears: number;
  meetsRequirement: boolean;
}

export interface SemanticMatchingStatus {
  status: 'enabled' | 'disabled' | 'unavailable';
  used: boolean;
}

export interface ScoreBreakdown {
  skillScore: number;
  experienceScore: number;
}

export interface MatchResult {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  skills: SkillMatchResult;
  experience: ExperienceResult;
  semanticMatching: SemanticMatchingStatus;
  reason: string;
}

export interface SemanticMapping {
  candidateSkill: string;
  requiredSkill: string;
  similarity: number;
}

export interface ScoringInput {
  candidateSkills: string[];
  jobRequiredSkills: string[];
  candidateExperience: number;
  jobMinExperience: number;
  semanticMappings: SemanticMapping[];
  semanticMatchingStatus: 'enabled' | 'disabled' | 'unavailable';
}

// ============================================================================
// Constants
// ============================================================================

const SKILL_WEIGHT = 70;
const EXPERIENCE_WEIGHT = 30;

// ============================================================================
// Normalization
// ============================================================================

/**
 * Normalize a skill label for exact comparison.
 * - Trims whitespace
 * - Converts to lowercase
 * - Collapses internal whitespace to a single space
 *
 * Does NOT aggressively merge hyphens and spaces because "self-taught"
 * and "self taught" might legitimately differ from "selftaught".
 */
export function normalizeSkillLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ============================================================================
// Skill Matching
// ============================================================================

/**
 * Match candidate skills against job-required skills.
 *
 * Algorithm:
 * 1. Exact matches first (by normalized label).
 * 2. Semantic matches for remaining unresolved skills (one-to-one).
 * 3. Remaining required skills are "missing".
 *
 * Each required skill can be satisfied by at most one candidate skill.
 * Each candidate skill can satisfy at most one required skill.
 * Exact matches always take precedence over semantic matches.
 */
export function matchSkills(
  candidateSkills: string[],
  jobRequiredSkills: string[],
  semanticMappings: SemanticMapping[]
): SkillMatchResult {
  const matchedSkills: MatchedSkill[] = [];

  // Normalize all skills
  const normalizedRequired = jobRequiredSkills.map(normalizeSkillLabel);
  const normalizedCandidate = candidateSkills.map(normalizeSkillLabel);

  // Track which skills have been consumed
  const usedRequiredIndexes = new Set<number>();
  const usedCandidateIndexes = new Set<number>();

  // Step 1: Exact matches
  for (let ri = 0; ri < normalizedRequired.length; ri++) {
    const reqSkill = normalizedRequired[ri]!;
    for (let ci = 0; ci < normalizedCandidate.length; ci++) {
      if (usedCandidateIndexes.has(ci)) continue;
      const candSkill = normalizedCandidate[ci]!;

      if (reqSkill === candSkill) {
        matchedSkills.push({
          requiredSkill: jobRequiredSkills[ri]!,
          candidateSkill: candidateSkills[ci]!,
          matchType: 'exact',
        });
        usedRequiredIndexes.add(ri);
        usedCandidateIndexes.add(ci);
        break;
      }
    }
  }

  // Step 2: Semantic matches for unresolved skills
  // Sort semantic mappings by similarity descending for greedy assignment,
  // with deterministic tie-breaking by required skill name then candidate skill name.
  const sortedMappings = [...semanticMappings].sort((a, b) => {
    if (b.similarity !== a.similarity) return b.similarity - a.similarity;
    if (a.requiredSkill < b.requiredSkill) return -1;
    if (a.requiredSkill > b.requiredSkill) return 1;
    if (a.candidateSkill < b.candidateSkill) return -1;
    if (a.candidateSkill > b.candidateSkill) return 1;
    return 0;
  });

  for (const mapping of sortedMappings) {
    const normalizedReq = normalizeSkillLabel(mapping.requiredSkill);
    const normalizedCand = normalizeSkillLabel(mapping.candidateSkill);

    // Find the index of the required skill (must be unresolved)
    const ri = normalizedRequired.findIndex(
      (s, idx) => s === normalizedReq && !usedRequiredIndexes.has(idx)
    );
    if (ri === -1) continue;

    // Find the index of the candidate skill (must be unused)
    const ci = normalizedCandidate.findIndex(
      (s, idx) => s === normalizedCand && !usedCandidateIndexes.has(idx)
    );
    if (ci === -1) continue;

    matchedSkills.push({
      requiredSkill: jobRequiredSkills[ri]!,
      candidateSkill: candidateSkills[ci]!,
      matchType: 'semantic',
      similarity: mapping.similarity,
    });
    usedRequiredIndexes.add(ri);
    usedCandidateIndexes.add(ci);
  }

  // Step 3: Identify missing skills
  const missingSkills: string[] = [];
  for (let ri = 0; ri < jobRequiredSkills.length; ri++) {
    if (!usedRequiredIndexes.has(ri)) {
      missingSkills.push(jobRequiredSkills[ri]!);
    }
  }

  const exactMatches = matchedSkills.filter(m => m.matchType === 'exact').length;
  const semanticMatchCount = matchedSkills.filter(m => m.matchType === 'semantic').length;

  return {
    required: jobRequiredSkills.length,
    exactMatches,
    semanticMatches: semanticMatchCount,
    matched: matchedSkills.length,
    matchedSkills,
    missingSkills,
  };
}

// ============================================================================
// Score Calculation
// ============================================================================

/**
 * Calculate the skill score component.
 * Formula: SKILL_WEIGHT × (matched / required)
 * If a job has no required skills, returns 0.
 */
export function calculateSkillScore(matched: number, required: number): number {
  if (required === 0) return 0;
  return SKILL_WEIGHT * (matched / required);
}

/**
 * Calculate the experience score component.
 * Formula: EXPERIENCE_WEIGHT × min(candidateExp / jobMinExp, 1)
 * If jobMinExp is 0, returns full EXPERIENCE_WEIGHT.
 */
export function calculateExperienceScore(candidateExp: number, jobMinExp: number): number {
  if (jobMinExp === 0) return EXPERIENCE_WEIGHT;
  return EXPERIENCE_WEIGHT * Math.min(candidateExp / jobMinExp, 1);
}

/**
 * Generate a human-readable explanation of the match.
 * Built from actual calculation data — never hardcoded per candidate.
 */
export function generateReason(
  skillResult: SkillMatchResult,
  experienceResult: ExperienceResult,
  semanticStatus: SemanticMatchingStatus
): string {
  const parts: string[] = [];

  // Skill description
  if (skillResult.required === 0) {
    parts.push('Job has no required skills defined');
  } else if (skillResult.matched === skillResult.required) {
    if (skillResult.semanticMatches > 0) {
      parts.push(
        `Matches all ${skillResult.required} required skill${skillResult.required > 1 ? 's' : ''}, ` +
        `including ${skillResult.semanticMatches} semantic match${skillResult.semanticMatches > 1 ? 'es' : ''}`
      );
    } else {
      parts.push(
        `Matches all ${skillResult.required} required skill${skillResult.required > 1 ? 's' : ''}`
      );
    }
  } else {
    const skillDesc = `Matches ${skillResult.matched} of ${skillResult.required} required skill${skillResult.required > 1 ? 's' : ''}`;
    if (skillResult.semanticMatches > 0) {
      parts.push(
        `${skillDesc}, including ${skillResult.semanticMatches} semantic match${skillResult.semanticMatches > 1 ? 'es' : ''}`
      );
    } else {
      parts.push(skillDesc);
    }
  }

  // Experience description
  if (experienceResult.meetsRequirement) {
    parts.push('meets the experience requirement');
  } else {
    parts.push('has less experience than required');
  }

  // Semantic status caveat
  if (semanticStatus.status === 'unavailable') {
    parts.push('but semantic matching was unavailable');
  } else if (semanticStatus.status === 'disabled') {
    // Only mention if it might have changed results
    // Don't clutter the explanation when it's off by default
  }

  // Join: first part capitalized, rest joined by " and " or ", "
  let reason = parts[0]!;
  if (parts.length === 2) {
    const conjunction = reason.includes(', including') ? ', and ' : ' and ';
    reason += conjunction + parts[1]!;
  } else if (parts.length === 3) {
    reason += ', ' + parts[1]! + ', ' + parts[2]!;
  }

  return reason + '.';
}

// ============================================================================
// Main Scoring Function
// ============================================================================

/**
 * Calculate the complete match result for a candidate-job pair.
 *
 * This is the single source of truth for scoring. Both endpoints
 * (/jobs/:id/matches and /candidates/:id/matches) call this function.
 *
 * @param input - All data needed for scoring (no DB or network access)
 * @returns Complete match result with scores, breakdowns, and explanation
 */
export function calculateMatch(input: ScoringInput): MatchResult {
  // 1. Match skills (exact + semantic)
  const skillResult = matchSkills(
    input.candidateSkills,
    input.jobRequiredSkills,
    input.semanticMappings
  );

  // 2. Calculate individual scores
  const skillScore = calculateSkillScore(skillResult.matched, skillResult.required);
  const experienceScore = calculateExperienceScore(
    input.candidateExperience,
    input.jobMinExperience
  );

  // 3. Total score (keep full precision internally)
  const totalScore = skillScore + experienceScore;

  // 4. Experience details
  const experienceResult: ExperienceResult = {
    candidateYears: input.candidateExperience,
    minimumRequiredYears: input.jobMinExperience,
    meetsRequirement: input.candidateExperience >= input.jobMinExperience,
  };

  // 5. Semantic matching status
  const semanticStatus: SemanticMatchingStatus = {
    status: input.semanticMatchingStatus,
    used: skillResult.semanticMatches > 0,
  };

  // 6. Generate explanation
  const reason = generateReason(skillResult, experienceResult, semanticStatus);

  return {
    score: totalScore,
    scoreBreakdown: {
      skillScore,
      experienceScore,
    },
    skills: skillResult,
    experience: experienceResult,
    semanticMatching: semanticStatus,
    reason,
  };
}

/**
 * Round a score for display purposes.
 * Rounds to 1 decimal place. Used only in API responses.
 */
export function roundScore(score: number): number {
  return Math.round(score * 10) / 10;
}

