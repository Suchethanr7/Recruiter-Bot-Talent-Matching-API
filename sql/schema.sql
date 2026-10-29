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
  quirk         TEXT,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_candidates_experience (experience)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jobs (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  title               VARCHAR(200) NOT NULL,
  min_experience      INT NOT NULL DEFAULT 0 CHECK (min_experience >= 0),
  tagline             TEXT,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

CREATE TABLE IF NOT EXISTS traits (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  normalized  VARCHAR(100) GENERATED ALWAYS AS (LOWER(TRIM(name))) STORED NOT NULL,
  UNIQUE KEY uq_traits_normalized (normalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS candidate_traits (
  candidate_id  INT NOT NULL,
  trait_id      INT NOT NULL,
  PRIMARY KEY (candidate_id, trait_id),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON DELETE CASCADE,
  FOREIGN KEY (trait_id) REFERENCES traits(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS culture_keywords (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  keyword     VARCHAR(100) NOT NULL,
  normalized  VARCHAR(100) GENERATED ALWAYS AS (LOWER(TRIM(keyword))) STORED NOT NULL,
  UNIQUE KEY uq_culture_keywords_normalized (normalized)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS job_culture_keywords (
  job_id      INT NOT NULL,
  keyword_id  INT NOT NULL,
  PRIMARY KEY (job_id, keyword_id),
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  FOREIGN KEY (keyword_id) REFERENCES culture_keywords(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
