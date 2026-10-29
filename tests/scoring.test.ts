/**
 * Unit tests for the pure scoring algorithm.
 *
 * These tests have NO dependencies on Express, MySQL, or AI providers.
 * They test the deterministic scoring logic directly.
 *
 * Run: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateMatch,
  calculateSkillScore,
  calculateExperienceScore,
  matchSkills,
  normalizeSkillLabel,
  generateReason,
  roundScore,
  type ScoringInput,
  type SemanticMapping,
} from '../src/services/scoring.js';

// ============================================================================
// normalizeSkillLabel
// ============================================================================

describe('normalizeSkillLabel', () => {
  it('trims whitespace', () => {
    assert.equal(normalizeSkillLabel('  leadership  '), 'leadership');
  });

  it('converts to lowercase', () => {
    assert.equal(normalizeSkillLabel('Public-Speaking'), 'public-speaking');
  });

  it('collapses internal whitespace', () => {
    assert.equal(normalizeSkillLabel('crisis   management'), 'crisis management');
  });

  it('preserves hyphens', () => {
    assert.equal(normalizeSkillLabel('rapid-prototyping'), 'rapid-prototyping');
  });
});

// ============================================================================
// calculateSkillScore
// ============================================================================

describe('calculateSkillScore', () => {
  it('returns 70 for complete overlap', () => {
    assert.equal(calculateSkillScore(3, 3), 70);
  });

  it('returns proportional score for partial overlap', () => {
    const score = calculateSkillScore(2, 3);
    assert.ok(Math.abs(score - 46.666666666666664) < 0.001);
  });

  it('returns 0 for no overlap', () => {
    assert.equal(calculateSkillScore(0, 3), 0);
  });

  it('returns 0 when job has no required skills', () => {
    assert.equal(calculateSkillScore(0, 0), 0);
  });

  it('handles single skill', () => {
    assert.equal(calculateSkillScore(1, 1), 70);
  });
});

// ============================================================================
// calculateExperienceScore
// ============================================================================

describe('calculateExperienceScore', () => {
  it('returns 30 when candidate meets requirement', () => {
    assert.equal(calculateExperienceScore(5, 3), 30);
  });

  it('returns 30 when candidate exactly meets requirement', () => {
    assert.equal(calculateExperienceScore(3, 3), 30);
  });

  it('returns 30 when candidate exceeds requirement (capped)', () => {
    assert.equal(calculateExperienceScore(20, 3), 30);
  });

  it('returns proportional score below requirement', () => {
    // 2/3 * 30 = 20
    assert.equal(calculateExperienceScore(2, 3), 20);
  });

  it('returns 30 when min experience is 0', () => {
    assert.equal(calculateExperienceScore(0, 0), 30);
  });

  it('returns 0 for 0 experience with positive requirement', () => {
    assert.equal(calculateExperienceScore(0, 5), 0);
  });

  it('handles partial experience correctly', () => {
    // 1/4 * 30 = 7.5
    assert.equal(calculateExperienceScore(1, 4), 7.5);
  });
});

// ============================================================================
// matchSkills
// ============================================================================

describe('matchSkills', () => {
  it('matches all skills exactly', () => {
    const result = matchSkills(
      ['deduction', 'pattern-recognition', 'forensics'],
      ['deduction', 'pattern-recognition', 'forensics'],
      []
    );
    assert.equal(result.required, 3);
    assert.equal(result.exactMatches, 3);
    assert.equal(result.semanticMatches, 0);
    assert.equal(result.matched, 3);
    assert.equal(result.missingSkills.length, 0);
  });

  it('handles partial exact overlap', () => {
    const result = matchSkills(
      ['deduction', 'chemistry'],
      ['deduction', 'pattern-recognition', 'forensics'],
      []
    );
    assert.equal(result.exactMatches, 1);
    assert.equal(result.matched, 1);
    assert.equal(result.missingSkills.length, 2);
    assert.deepEqual(result.missingSkills, ['pattern-recognition', 'forensics']);
  });

  it('handles no overlap', () => {
    const result = matchSkills(
      ['woodworking', 'minimalism'],
      ['deduction', 'pattern-recognition', 'forensics'],
      []
    );
    assert.equal(result.exactMatches, 0);
    assert.equal(result.matched, 0);
    assert.equal(result.missingSkills.length, 3);
  });

  it('extra candidate skills do not affect score', () => {
    const result = matchSkills(
      ['deduction', 'pattern-recognition', 'forensics', 'chemistry', 'leadership'],
      ['deduction', 'pattern-recognition', 'forensics'],
      []
    );
    assert.equal(result.matched, 3);
    assert.equal(result.missingSkills.length, 0);
  });

  it('handles empty required skills', () => {
    const result = matchSkills(
      ['deduction', 'forensics'],
      [],
      []
    );
    assert.equal(result.required, 0);
    assert.equal(result.matched, 0);
    assert.equal(result.missingSkills.length, 0);
  });

  it('handles empty candidate skills', () => {
    const result = matchSkills(
      [],
      ['deduction', 'forensics'],
      []
    );
    assert.equal(result.matched, 0);
    assert.equal(result.missingSkills.length, 2);
  });

  it('applies semantic mappings for unresolved skills', () => {
    const semanticMappings: SemanticMapping[] = [
      { candidateSkill: 'system design', requiredSkill: 'systems-design', similarity: 0.95 },
    ];

    const result = matchSkills(
      ['system design', 'chemistry'],
      ['systems-design', 'forensics'],
      semanticMappings
    );

    assert.equal(result.exactMatches, 0);
    assert.equal(result.semanticMatches, 1);
    assert.equal(result.matched, 1);
    assert.equal(result.matchedSkills[0]!.matchType, 'semantic');
    assert.equal(result.matchedSkills[0]!.similarity, 0.95);
    assert.deepEqual(result.missingSkills, ['forensics']);
  });

  it('exact match takes precedence over semantic match', () => {
    const semanticMappings: SemanticMapping[] = [
      { candidateSkill: 'deduction', requiredSkill: 'deduction', similarity: 0.99 },
    ];

    const result = matchSkills(
      ['deduction'],
      ['deduction'],
      semanticMappings
    );

    assert.equal(result.exactMatches, 1);
    assert.equal(result.semanticMatches, 0);
    assert.equal(result.matchedSkills[0]!.matchType, 'exact');
  });

  it('enforces one-to-one mapping for semantic matches', () => {
    // One candidate skill cannot satisfy two required skills
    const semanticMappings: SemanticMapping[] = [
      { candidateSkill: 'analysis', requiredSkill: 'deduction', similarity: 0.85 },
      { candidateSkill: 'analysis', requiredSkill: 'pattern-recognition', similarity: 0.83 },
    ];

    const result = matchSkills(
      ['analysis'],
      ['deduction', 'pattern-recognition'],
      semanticMappings
    );

    // Should only match one (highest similarity: deduction)
    assert.equal(result.semanticMatches, 1);
    assert.equal(result.matched, 1);
    assert.equal(result.matchedSkills[0]!.requiredSkill, 'deduction');
    assert.equal(result.missingSkills.length, 1);
  });

  it('case-insensitive exact matching', () => {
    const result = matchSkills(
      ['Deduction', 'FORENSICS'],
      ['deduction', 'forensics'],
      []
    );
    assert.equal(result.exactMatches, 2);
  });
});

// ============================================================================
// calculateMatch (integration of skill + experience scoring)
// ============================================================================

describe('calculateMatch', () => {
  it('returns perfect score for perfect match', () => {
    const input: ScoringInput = {
      candidateSkills: ['deduction', 'pattern-recognition', 'forensics'],
      jobRequiredSkills: ['deduction', 'pattern-recognition', 'forensics'],
      candidateExperience: 8,
      jobMinExperience: 3,
      semanticMappings: [],
      semanticMatchingStatus: 'enabled',
    };

    const result = calculateMatch(input);
    assert.equal(result.score, 100);
    assert.equal(result.scoreBreakdown.skillScore, 70);
    assert.equal(result.scoreBreakdown.experienceScore, 30);
  });

  it('returns zero for no overlap and no experience', () => {
    const input: ScoringInput = {
      candidateSkills: ['woodworking'],
      jobRequiredSkills: ['deduction', 'forensics'],
      candidateExperience: 0,
      jobMinExperience: 5,
      semanticMappings: [],
      semanticMatchingStatus: 'enabled',
    };

    const result = calculateMatch(input);
    assert.equal(result.score, 0);
  });

  it('handles below-minimum experience with full skill match', () => {
    const input: ScoringInput = {
      candidateSkills: ['deduction', 'pattern-recognition', 'forensics'],
      jobRequiredSkills: ['deduction', 'pattern-recognition', 'forensics'],
      candidateExperience: 1,
      jobMinExperience: 3,
      semanticMappings: [],
      semanticMatchingStatus: 'enabled',
    };

    const result = calculateMatch(input);
    // 70 + (1/3 * 30) = 70 + 10 = 80
    assert.equal(result.score, 80);
    assert.equal(result.experience.meetsRequirement, false);
  });

  it('returns only experience score when no skills matched', () => {
    const input: ScoringInput = {
      candidateSkills: ['woodworking'],
      jobRequiredSkills: ['deduction', 'forensics'],
      candidateExperience: 10,
      jobMinExperience: 3,
      semanticMappings: [],
      semanticMatchingStatus: 'enabled',
    };

    const result = calculateMatch(input);
    assert.equal(result.scoreBreakdown.skillScore, 0);
    assert.equal(result.scoreBreakdown.experienceScore, 30);
    assert.equal(result.score, 30);
  });

  it('score is bounded between 0 and 100', () => {
    // Max case
    const maxInput: ScoringInput = {
      candidateSkills: ['a', 'b', 'c'],
      jobRequiredSkills: ['a', 'b', 'c'],
      candidateExperience: 100,
      jobMinExperience: 1,
      semanticMappings: [],
      semanticMatchingStatus: 'enabled',
    };
    const maxResult = calculateMatch(maxInput);
    assert.ok(maxResult.score <= 100);
    assert.ok(maxResult.score >= 0);

    // Min case
    const minInput: ScoringInput = {
      candidateSkills: ['x'],
      jobRequiredSkills: ['a', 'b'],
      candidateExperience: 0,
      jobMinExperience: 10,
      semanticMappings: [],
      semanticMatchingStatus: 'enabled',
    };
    const minResult = calculateMatch(minInput);
    assert.ok(minResult.score >= 0);
    assert.ok(minResult.score <= 100);
  });

  it('includes semantic match info when semantic mapping used', () => {
    const input: ScoringInput = {
      candidateSkills: ['system design'],
      jobRequiredSkills: ['systems-design'],
      candidateExperience: 5,
      jobMinExperience: 2,
      semanticMappings: [
        { candidateSkill: 'system design', requiredSkill: 'systems-design', similarity: 0.92 },
      ],
      semanticMatchingStatus: 'enabled',
    };

    const result = calculateMatch(input);
    assert.equal(result.skills.semanticMatches, 1);
    assert.equal(result.semanticMatching.used, true);
    assert.equal(result.semanticMatching.status, 'enabled');
  });

  it('marks semantic matching as disabled', () => {
    const input: ScoringInput = {
      candidateSkills: ['deduction'],
      jobRequiredSkills: ['deduction'],
      candidateExperience: 5,
      jobMinExperience: 3,
      semanticMappings: [],
      semanticMatchingStatus: 'disabled',
    };

    const result = calculateMatch(input);
    assert.equal(result.semanticMatching.status, 'disabled');
    assert.equal(result.semanticMatching.used, false);
  });

  it('marks semantic matching as unavailable', () => {
    const input: ScoringInput = {
      candidateSkills: ['deduction'],
      jobRequiredSkills: ['deduction'],
      candidateExperience: 5,
      jobMinExperience: 3,
      semanticMappings: [],
      semanticMatchingStatus: 'unavailable',
    };

    const result = calculateMatch(input);
    assert.equal(result.semanticMatching.status, 'unavailable');
  });

  it('zero min experience gives full experience score', () => {
    const input: ScoringInput = {
      candidateSkills: [],
      jobRequiredSkills: ['deduction'],
      candidateExperience: 0,
      jobMinExperience: 0,
      semanticMappings: [],
      semanticMatchingStatus: 'enabled',
    };

    const result = calculateMatch(input);
    assert.equal(result.scoreBreakdown.experienceScore, 30);
  });

  it('empty required skills returns zero skill score', () => {
    const input: ScoringInput = {
      candidateSkills: ['deduction', 'forensics'],
      jobRequiredSkills: [],
      candidateExperience: 10,
      jobMinExperience: 3,
      semanticMappings: [],
      semanticMatchingStatus: 'enabled',
    };

    const result = calculateMatch(input);
    assert.equal(result.scoreBreakdown.skillScore, 0);
    assert.equal(result.score, 30);
  });
});

// ============================================================================
// Deterministic tie-breaking
// ============================================================================

describe('deterministic tie-breaking', () => {
  it('same inputs always produce same score', () => {
    const input: ScoringInput = {
      candidateSkills: ['research', 'public-speaking'],
      jobRequiredSkills: ['public-speaking', 'research'],
      candidateExperience: 4,
      jobMinExperience: 2,
      semanticMappings: [],
      semanticMatchingStatus: 'enabled',
    };

    const result1 = calculateMatch(input);
    const result2 = calculateMatch(input);
    assert.equal(result1.score, result2.score);
    assert.equal(result1.skills.matched, result2.skills.matched);
  });

  it('score is identical regardless of endpoint direction', () => {
    // Same candidate-job pair should produce same score
    // whether computed from job→candidates or candidate→jobs

    const candidateSkills = ['deduction', 'pattern-recognition'];
    const jobRequiredSkills = ['deduction', 'pattern-recognition', 'forensics'];
    const candidateExp = 5;
    const jobMinExp = 3;

    const input: ScoringInput = {
      candidateSkills,
      jobRequiredSkills,
      candidateExperience: candidateExp,
      jobMinExperience: jobMinExp,
      semanticMappings: [],
      semanticMatchingStatus: 'enabled',
    };

    // Both directions use the exact same function
    const scoreFromJobEndpoint = calculateMatch(input);
    const scoreFromCandidateEndpoint = calculateMatch(input);

    assert.equal(scoreFromJobEndpoint.score, scoreFromCandidateEndpoint.score);
    assert.equal(
      scoreFromJobEndpoint.scoreBreakdown.skillScore,
      scoreFromCandidateEndpoint.scoreBreakdown.skillScore
    );
  });
});

// ============================================================================
// generateReason
// ============================================================================

describe('generateReason', () => {
  it('generates correct reason for perfect match', () => {
    const reason = generateReason(
      { required: 3, exactMatches: 3, semanticMatches: 0, matched: 3, matchedSkills: [], missingSkills: [] },
      { candidateYears: 8, minimumRequiredYears: 3, meetsRequirement: true },
      { status: 'enabled', used: false }
    );
    assert.equal(reason, 'Matches all 3 required skills and meets the experience requirement.');
  });

  it('generates correct reason for partial match with semantic', () => {
    const reason = generateReason(
      { required: 3, exactMatches: 1, semanticMatches: 1, matched: 2, matchedSkills: [], missingSkills: ['forensics'] },
      { candidateYears: 2, minimumRequiredYears: 3, meetsRequirement: false },
      { status: 'enabled', used: true }
    );
    assert.equal(reason, 'Matches 2 of 3 required skills, including 1 semantic match, and has less experience than required.');
  });

  it('mentions unavailable semantic matching', () => {
    const reason = generateReason(
      { required: 3, exactMatches: 1, semanticMatches: 0, matched: 1, matchedSkills: [], missingSkills: ['a', 'b'] },
      { candidateYears: 5, minimumRequiredYears: 3, meetsRequirement: true },
      { status: 'unavailable', used: false }
    );
    assert.ok(reason.includes('semantic matching was unavailable'));
  });
});

// ============================================================================
// roundScore
// ============================================================================

describe('roundScore', () => {
  it('rounds to one decimal place', () => {
    assert.equal(roundScore(46.666666666), 46.7);
  });

  it('keeps integers as integers', () => {
    assert.equal(roundScore(70), 70);
  });

  it('rounds 0.5 up', () => {
    assert.equal(roundScore(50.05), 50.1);
  });
});
