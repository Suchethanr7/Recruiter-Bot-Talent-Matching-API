/**
 * Pure scoring algorithm for candidate-job matching.
 *
 * This module has NO dependencies on Express, MySQL, AI providers, or network access.
 * All functions are pure: given the same inputs, they always produce the same outputs.
 *
 * Scoring weights (transparent baseline, not empirically optimized):
 *   - Skill matching:  60 points (60%)
 *   - Experience fit:  25 points (25%)
 *   - Availability alignment: 10 points (10%)
 *   - Job-related preferences: 5 points (5%)
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
  availabilityScore: number;
  preferenceScore: number;
}

export interface MatchResult {
  score: number;
  scoreBreakdown: ScoreBreakdown;
  skills: SkillMatchResult;
  experience: ExperienceResult;
  semanticMatching: SemanticMatchingStatus;
  availabilityAlignment: AvailabilityAlignment;
  preferenceAlignment: PreferenceAlignment;
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
  candidateAvailability?: string | null;
  jobAvailabilityRequirement?: string | null;
  candidatePreferences?: CandidatePreference[];
  jobPreferences?: JobPreference[];
}

// ============================================================================
// Constants
// ============================================================================

const SKILL_WEIGHT = 60;
const EXPERIENCE_WEIGHT = 25;
const AVAILABILITY_WEIGHT = 10;
const PREFERENCE_WEIGHT = 5;

export type PreferenceDimension = 'work_arrangement' | 'schedule' | 'travel';

export interface JobPreference {
  dimension: PreferenceDimension;
  value: string;
}

export interface CandidatePreference {
  dimension: PreferenceDimension;
  value: string;
}

export interface AvailabilityAlignment {
  candidateAvailability: string | null;
  jobRequirement: string | null;
  aligned: boolean | null;
  score: number;
}

export interface PreferenceAlignment {
  compared: number;
  matched: number;
  score: number;
  matches: Array<{
    dimension: PreferenceDimension;
    candidateValue: string;
    jobRequirement: string;
    matched: boolean;
  }>;
}

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

export function calculateAvailabilityAlignment(
  candidateAvailability: string | null | undefined,
  jobRequirement: string | null | undefined
): AvailabilityAlignment {
  if (!candidateAvailability || !jobRequirement) {
    return {
      candidateAvailability: candidateAvailability ?? null,
      jobRequirement: jobRequirement ?? null,
      aligned: null,
      score: AVAILABILITY_WEIGHT,
    };
  }

  const candidate = candidateAvailability.trim().toLowerCase();
  const requirement = jobRequirement.trim().toLowerCase();
  const available = candidate === 'immediate' || candidate === '2 weeks';
  let aligned = false;

  if (requirement === 'flexible') {
    aligned = available;
  } else if (requirement === 'within_2_weeks') {
    aligned = candidate === 'immediate' || candidate === '2 weeks';
  } else if (requirement === 'immediate') {
    aligned = candidate === 'immediate';
  } else {
    throw new Error(`Unsupported job availability requirement: "${jobRequirement}"`);
  }

  return {
    candidateAvailability,
    jobRequirement,
    aligned,
    score: aligned ? AVAILABILITY_WEIGHT : 0,
  };
}

function isPreferenceCompatible(
  dimension: PreferenceDimension,
  candidateValue: string,
  jobRequirement: string
): boolean {
  const candidate = candidateValue.trim().toLowerCase();
  const requirement = jobRequirement.trim().toLowerCase();

  if (candidate === 'flexible' || requirement === 'flexible' || requirement === 'any') {
    return true;
  }

  if (dimension === 'travel') {
    const willingness: Record<string, number> = {
      none: 0,
      occasional: 1,
      frequent: 2,
    };
    const required = willingness[requirement];
    const offered = willingness[candidate];
    if (required === undefined || offered === undefined) {
      throw new Error(`Unsupported travel preference: candidate="${candidateValue}", job="${jobRequirement}"`);
    }
    return offered >= required;
  }

  return candidate === requirement;
}

export function calculatePreferenceAlignment(
  candidatePreferences: CandidatePreference[] = [],
  jobPreferences: JobPreference[] = []
): PreferenceAlignment {
  const candidateValues = new Map(candidatePreferences.map(({ dimension, value }) => [dimension, value]));
  const matches = jobPreferences.flatMap(({ dimension, value: jobRequirement }) => {
    const candidateValue = candidateValues.get(dimension);
    if (candidateValue === undefined) return [];
    return [{
      dimension,
      candidateValue,
      jobRequirement,
      matched: isPreferenceCompatible(dimension, candidateValue, jobRequirement),
    }];
  });

  const compared = matches.length;
  const matched = matches.filter(match => match.matched).length;
  return {
    compared,
    matched,
    score: compared === 0 ? PREFERENCE_WEIGHT : PREFERENCE_WEIGHT * (matched / compared),
    matches,
  };
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
  const availabilityAlignment = calculateAvailabilityAlignment(
    input.candidateAvailability,
    input.jobAvailabilityRequirement
  );
  const preferenceAlignment = calculatePreferenceAlignment(
    input.candidatePreferences,
    input.jobPreferences
  );

  // 3. Total score (keep full precision internally)
  const totalScore = skillScore + experienceScore +
    availabilityAlignment.score + preferenceAlignment.score;

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
      availabilityScore: availabilityAlignment.score,
      preferenceScore: preferenceAlignment.score,
    },
    skills: skillResult,
    experience: experienceResult,
    semanticMatching: semanticStatus,
    availabilityAlignment,
    preferenceAlignment,
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
