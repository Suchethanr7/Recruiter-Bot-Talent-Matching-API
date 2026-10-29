-- RecruiterFlow Database Schema
-- MySQL 8.x compatible, normalized relational design

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- Core Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS skills (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  -- Normalized lowercase, trimmed name for deduplication
  normalized  VARCHAR(100) GENERATED ALWAYS AS (LOWER(TRIM(name))) STORED NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_skills_normalized (normalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS candidates (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  experience    INT NOT NULL CHECK (experience >= 0),
  availability  VARCHAR(50) NOT NULL,
  traits        JSON,
  quirk         TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_candidates_experience (experience)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jobs (
  id                       INT AUTO_INCREMENT PRIMARY KEY,
  title                    VARCHAR(200) NOT NULL,
  min_experience           INT NOT NULL DEFAULT 0 CHECK (min_experience >= 0),
  culture_keywords         JSON,
  tagline                  TEXT,
  availability_requirement VARCHAR(30),
  created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_jobs_min_experience (min_experience)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Relationship Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS candidate_skills (
  candidate_id  INT NOT NULL,
  skill_id      INT NOT NULL,
  PRIMARY KEY (candidate_id, skill_id),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_required_skills (
  job_id    INT NOT NULL,
  skill_id  INT NOT NULL,
  PRIMARY KEY (job_id, skill_id),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Explicit, job-related preferences. Personality traits and humorous profile
-- text are deliberately excluded from candidate scoring.
CREATE TABLE IF NOT EXISTS candidate_preferences (
  candidate_id  INT NOT NULL,
  dimension     VARCHAR(30) NOT NULL,
  value         VARCHAR(50) NOT NULL,
  PRIMARY KEY (candidate_id, dimension),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_preferences (
  job_id     INT NOT NULL,
  dimension  VARCHAR(30) NOT NULL,
  value      VARCHAR(50) NOT NULL,
  PRIMARY KEY (job_id, dimension),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
