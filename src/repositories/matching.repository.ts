/**
 * Database repository for matching operations.
 *
 * All SQL is handwritten and parameterized.
 * Uses mysql2 promise API with connection pool.
 * Batch queries are used to minimize round trips.
 */

import type { Pool, RowDataPacket } from 'mysql2/promise';

// ============================================================================
// Types
// ============================================================================

export interface CandidateRecord {
  id: number;
  name: string;
  experience: number;
  availability: string;
  quirk: string | null;
}

export interface JobRecord {
  id: number;
  title: string;
  minExperience: number;
  tagline: string | null;
  availabilityRequirement: string | null;
}

export type PreferenceDimension = 'work_arrangement' | 'schedule' | 'travel';

export interface CandidatePreference {
  dimension: PreferenceDimension;
  value: string;
}

export interface JobPreference {
  dimension: PreferenceDimension;
  value: string;
}

export interface CandidateWithSkills extends CandidateRecord {
  skills: string[];
  preferences: CandidatePreference[];
}

export interface JobWithSkills extends JobRecord {
  requiredSkills: string[];
  preferences: JobPreference[];
}

// ============================================================================
// Row types for mysql2
// ============================================================================

interface CandidateRow extends RowDataPacket {
  id: number;
  name: string;
  experience: number;
  availability: string;
  quirk: string | null;
}

interface JobRow extends RowDataPacket {
  id: number;
  title: string;
  min_experience: number;
  tagline: string | null;
  availability_requirement: string | null;
}

interface SkillRow extends RowDataPacket {
  entity_id: number;
  skill_name: string;
}

interface PreferenceRow extends RowDataPacket {
  entity_id: number;
  dimension: PreferenceDimension;
  value: string;
}

// ============================================================================
// Repository
// ============================================================================

export class MatchingRepository {
  constructor(private readonly pool: Pool) {}

  // --------------------------------------------------------------------------
  // Job Lookups
  // --------------------------------------------------------------------------

  /**
   * Get a single job by ID.
   * Returns null if not found.
   */
  async getJobById(jobId: number): Promise<JobRecord | null> {
    const [rows] = await this.pool.execute<JobRow[]>(
      `SELECT j.id, j.title, j.min_experience, j.tagline,
              j.availability_requirement
       FROM jobs j
       WHERE j.id = ?`,
      [jobId]
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      minExperience: row.min_experience,
      tagline: row.tagline,
      availabilityRequirement: row.availability_requirement,
    };
  }

  async getJobPreferences(jobId: number): Promise<JobPreference[]> {
    const [rows] = await this.pool.execute<PreferenceRow[]>(
      `SELECT dimension, value
       FROM job_preferences
       WHERE job_id = ?
       ORDER BY dimension`,
      [jobId]
    );
    return rows.map(({ dimension, value }) => ({ dimension, value }));
  }

  /**
   * Get required skills for a job.
   */
  async getJobRequiredSkills(jobId: number): Promise<string[]> {
    const [rows] = await this.pool.execute<SkillRow[]>(
      `SELECT s.name AS skill_name
       FROM job_required_skills jrs
       JOIN skills s ON s.id = jrs.skill_id
       WHERE jrs.job_id = ?
       ORDER BY s.name`,
      [jobId]
    );

    return rows.map(r => r.skill_name);
  }

  // --------------------------------------------------------------------------
  // Candidate Lookups
  // --------------------------------------------------------------------------

  /**
   * Get a single candidate by ID.
   * Returns null if not found.
   */
  async getCandidateById(candidateId: number): Promise<CandidateRecord | null> {
    const [rows] = await this.pool.execute<CandidateRow[]>(
      `SELECT id, name, experience, availability, quirk
       FROM candidates
       WHERE id = ?`,
      [candidateId]
    );

    const row = rows[0];
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      experience: row.experience,
      availability: row.availability,
      quirk: row.quirk,
    };
  }

  /**
   * Get skills for a single candidate.
   */
  async getCandidateSkills(candidateId: number): Promise<string[]> {
    const [rows] = await this.pool.execute<SkillRow[]>(
      `SELECT s.name AS skill_name
       FROM candidate_skills cs
       JOIN skills s ON s.id = cs.skill_id
       WHERE cs.candidate_id = ?
       ORDER BY s.name`,
      [candidateId]
    );

    return rows.map(r => r.skill_name);
  }

  async getCandidatePreferences(candidateId: number): Promise<CandidatePreference[]> {
    const [rows] = await this.pool.execute<PreferenceRow[]>(
      `SELECT dimension, value
       FROM candidate_preferences
       WHERE candidate_id = ?
       ORDER BY dimension`,
      [candidateId]
    );
    return rows.map(({ dimension, value }) => ({ dimension, value }));
  }

  // --------------------------------------------------------------------------
  // Batch Operations (for matching endpoints)
  // --------------------------------------------------------------------------

  /**
   * Get all candidates with their skills in two efficient queries.
   * Used by GET /jobs/:id/matches to rank all candidates.
   */
  async getAllCandidatesWithSkills(): Promise<CandidateWithSkills[]> {
    // Query 1: Get all candidates
    const [candidateRows] = await this.pool.execute<CandidateRow[]>(
      `SELECT id, name, experience, availability, quirk
       FROM candidates
       ORDER BY id`
    );

    if (candidateRows.length === 0) return [];

    // Query 2: Get all candidate skills in a single batch query
    const [skillRows] = await this.pool.execute<SkillRow[]>(
      `SELECT cs.candidate_id AS entity_id, s.name AS skill_name
       FROM candidate_skills cs
       JOIN skills s ON s.id = cs.skill_id
       ORDER BY cs.candidate_id, s.name`
    );

    const [preferenceRows] = await this.pool.execute<PreferenceRow[]>(
      `SELECT candidate_id AS entity_id, dimension, value
       FROM candidate_preferences
       ORDER BY candidate_id, dimension`
    );

    // Group skills by candidate ID
    const skillsByCandidate = new Map<number, string[]>();
    for (const row of skillRows) {
      const skills = skillsByCandidate.get(row.entity_id) ?? [];
      skills.push(row.skill_name);
      skillsByCandidate.set(row.entity_id, skills);
    }

    const preferencesByCandidate = new Map<number, CandidatePreference[]>();
    for (const row of preferenceRows) {
      const preferences = preferencesByCandidate.get(row.entity_id) ?? [];
      preferences.push({ dimension: row.dimension, value: row.value });
      preferencesByCandidate.set(row.entity_id, preferences);
    }

    // Combine candidates with their skills
    return candidateRows.map(c => ({
      id: c.id,
      name: c.name,
      experience: c.experience,
      availability: c.availability,
      quirk: c.quirk,
      skills: skillsByCandidate.get(c.id) ?? [],
      preferences: preferencesByCandidate.get(c.id) ?? [],
    }));
  }

  /**
   * Get all jobs with their required skills in two efficient queries.
   * Used by GET /candidates/:id/matches to rank all jobs.
   */
  async getAllJobsWithSkills(): Promise<JobWithSkills[]> {
    // Query 1: Get all jobs
    const [jobRows] = await this.pool.execute<JobRow[]>(
      `SELECT j.id, j.title, j.min_experience, j.tagline,
              j.availability_requirement
       FROM jobs j
       ORDER BY j.id`
    );

    if (jobRows.length === 0) return [];

    // Query 2: Get all job required skills in a single batch query
    const [skillRows] = await this.pool.execute<SkillRow[]>(
      `SELECT jrs.job_id AS entity_id, s.name AS skill_name
       FROM job_required_skills jrs
       JOIN skills s ON s.id = jrs.skill_id
       ORDER BY jrs.job_id, s.name`
    );

    const [preferenceRows] = await this.pool.execute<PreferenceRow[]>(
      `SELECT job_id AS entity_id, dimension, value
       FROM job_preferences
       ORDER BY job_id, dimension`
    );

    // Group skills by job ID
    const skillsByJob = new Map<number, string[]>();
    for (const row of skillRows) {
      const skills = skillsByJob.get(row.entity_id) ?? [];
      skills.push(row.skill_name);
      skillsByJob.set(row.entity_id, skills);
    }

    const preferencesByJob = new Map<number, JobPreference[]>();
    for (const row of preferenceRows) {
      const preferences = preferencesByJob.get(row.entity_id) ?? [];
      preferences.push({ dimension: row.dimension, value: row.value });
      preferencesByJob.set(row.entity_id, preferences);
    }

    // Combine jobs with their required skills
    return jobRows.map(j => ({
      id: j.id,
      title: j.title,
      minExperience: j.min_experience,
      tagline: j.tagline,
      availabilityRequirement: j.availability_requirement,
      requiredSkills: skillsByJob.get(j.id) ?? [],
      preferences: preferencesByJob.get(j.id) ?? [],
    }));
  }

  /**
   * Check if a job exists by ID.
   */
  async jobExists(jobId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM jobs WHERE id = ? LIMIT 1`,
      [jobId]
    );
    return rows.length > 0;
  }

  /**
   * Check if a candidate exists by ID.
   */
  async candidateExists(candidateId: number): Promise<boolean> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT 1 FROM candidates WHERE id = ? LIMIT 1`,
      [candidateId]
    );
    return rows.length > 0;
  }
}
