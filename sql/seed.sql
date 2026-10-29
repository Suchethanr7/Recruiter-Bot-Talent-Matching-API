-- RecruiterFlow Seed Data
-- Repeatable: uses INSERT IGNORE + normalized skill deduplication
-- Preserves supplied IDs for the 15 candidates and 6 jobs

-- ============================================================================
-- Skills (INSERT IGNORE prevents duplicates on rerun via unique normalized)
-- ============================================================================
INSERT IGNORE INTO skills (name) VALUES
  ('deduction'), ('pattern-recognition'), ('forensics'),
  ('research'), ('time-management'), ('public-speaking'),
  ('systems-design'), ('rapid-prototyping'), ('leadership'),
  ('project-management'), ('stakeholder-management'),
  ('woodworking'), ('minimalism'), ('negotiation'),
  ('chemistry'),
  ('persuasion'),
  ('resourcefulness'),
  ('theoretical-analysis'),
  ('precision'), ('strategy'), ('crisis-management'),
  ('sales'), ('team-building'),
  ('optimism'), ('mentorship'),
  ('security'), ('loyalty');

-- ============================================================================
-- Candidates (INSERT IGNORE on primary key preserves IDs, prevents duplicates)
-- ============================================================================
INSERT INTO candidates (id, name, experience, availability, traits, quirk) VALUES
  (1,  'Sherlock H.',  8,  'Immediate', JSON_ARRAY('analytical', 'blunt'), 'Solves problems by eliminating the impossible; occasionally insufferable in standups.'),
  (2,  'Hermione G.',  4,  '2 weeks', JSON_ARRAY('detail-oriented', 'overachiever'), 'Reads the entire documentation before writing a single line of code.'),
  (3,  'Tony S.',      12, 'Not looking', JSON_ARRAY('confident', 'innovative'), 'Ships an MVP overnight, refuses to write tests.'),
  (4,  'Leslie K.',    6,  'Immediate', JSON_ARRAY('tenacious', 'organized'), 'Has a binder for everything, including the binder.'),
  (5,  'Ron S.',       15, 'Not looking', JSON_ARRAY('stubborn', 'principled'), 'Refuses to use more than one monitor.'),
  (6,  'Rick S.',      20, 'Immediate', JSON_ARRAY('genius', 'reckless'), 'Solution works, mechanism deeply concerning.'),
  (7,  'Elle W.',      3,  'Immediate', JSON_ARRAY('optimistic', 'sharp'), 'Underestimated in every standup, correct in every retro.'),
  (8,  'MacGyver',     10, '2 weeks', JSON_ARRAY('calm', 'improviser'), 'Fixes production outages with duct tape and a paperclip metaphor.'),
  (9,  'Sheldon C.',   9,  'Immediate', JSON_ARRAY('rigid', 'brilliant'), 'Correct 95% of the time, insufferable 100% of the time.'),
  (10, 'Katniss E.',   5,  'Immediate', JSON_ARRAY('resilient', 'decisive'), 'Excellent under pressure, terrible with public speaking.'),
  (11, 'Michael S.',   11, 'Not looking', JSON_ARRAY('enthusiastic', 'chaotic'), 'World''s best boss, according to a mug he bought himself.'),
  (12, 'Olivia P.',    13, '2 weeks', JSON_ARRAY('decisive', 'intense'), 'Handles it. Whatever it is.'),
  (13, 'Ted L.',       7,  'Immediate', JSON_ARRAY('empathetic', 'persistent'), 'Turns every technical setback into a folksy metaphor.'),
  (14, 'Miranda P.',   18, 'Not looking', JSON_ARRAY('demanding', 'decisive'), 'Reviews every PR personally. Says nothing. Everyone panics.'),
  (15, 'Dwight S.',    9,  'Immediate', JSON_ARRAY('intense', 'loyal'), 'Assistant to the regional backend engineer.')
ON DUPLICATE KEY UPDATE traits = VALUES(traits);

-- ============================================================================
-- Jobs (INSERT IGNORE on primary key preserves IDs, prevents duplicates)
-- ============================================================================
INSERT INTO jobs (id, title, min_experience, culture_keywords, tagline, availability_requirement) VALUES
  (1, 'Backend Detective', 3, JSON_ARRAY('analytical', 'autonomous'), 'We have a bug. We have no leads. We have you.', 'within_2_weeks'),
  (2, 'Rapid Prototyping Engineer', 2, JSON_ARRAY('innovative', 'fast-paced'), 'Ship first, document never (kidding — please document).', 'within_2_weeks'),
  (3, 'Developer Relations Lead', 2, JSON_ARRAY('energetic', 'curious'), 'Explain complex things to confused humans, cheerfully.', 'flexible'),
  (4, 'Engineering Manager, Chaos Team', 5, JSON_ARRAY('empathetic', 'organized'), 'Herd cats. The cats are senior engineers.', 'within_2_weeks'),
  (5, 'Incident Commander', 4, JSON_ARRAY('decisive', 'calm-under-pressure'), ' 3am page. You''re the one who picks up.', 'immediate'),
  (6, 'Sales Engineer', 3, JSON_ARRAY('enthusiastic', 'persistent'), 'Sell the vision, then go build it.', 'flexible')
ON DUPLICATE KEY UPDATE
  culture_keywords = VALUES(culture_keywords),
  availability_requirement = VALUES(availability_requirement);

-- ============================================================================
-- Demo availability requirements and explicit work preferences
-- These are illustrative values for fictional seed profiles, not real hiring data.
-- ============================================================================
INSERT IGNORE INTO candidate_preferences (candidate_id, dimension, value) VALUES
  (1, 'work_arrangement', 'hybrid'), (1, 'schedule', 'standard'), (1, 'travel', 'occasional'),
  (2, 'work_arrangement', 'remote'), (2, 'schedule', 'flexible'), (2, 'travel', 'none'),
  (3, 'work_arrangement', 'remote'), (3, 'schedule', 'flexible'), (3, 'travel', 'frequent'),
  (4, 'work_arrangement', 'on-site'), (4, 'schedule', 'standard'), (4, 'travel', 'occasional'),
  (5, 'work_arrangement', 'remote'), (5, 'schedule', 'night'), (5, 'travel', 'none'),
  (6, 'work_arrangement', 'flexible'), (6, 'schedule', 'flexible'), (6, 'travel', 'frequent'),
  (7, 'work_arrangement', 'hybrid'), (7, 'schedule', 'standard'), (7, 'travel', 'occasional'),
  (8, 'work_arrangement', 'on-site'), (8, 'schedule', 'flexible'), (8, 'travel', 'frequent'),
  (9, 'work_arrangement', 'remote'), (9, 'schedule', 'standard'), (9, 'travel', 'none'),
  (10, 'work_arrangement', 'hybrid'), (10, 'schedule', 'night'), (10, 'travel', 'frequent'),
  (11, 'work_arrangement', 'on-site'), (11, 'schedule', 'flexible'), (11, 'travel', 'occasional'),
  (12, 'work_arrangement', 'remote'), (12, 'schedule', 'standard'), (12, 'travel', 'frequent'),
  (13, 'work_arrangement', 'hybrid'), (13, 'schedule', 'flexible'), (13, 'travel', 'none'),
  (14, 'work_arrangement', 'on-site'), (14, 'schedule', 'standard'), (14, 'travel', 'occasional'),
  (15, 'work_arrangement', 'on-site'), (15, 'schedule', 'night'), (15, 'travel', 'frequent');

INSERT IGNORE INTO job_preferences (job_id, dimension, value) VALUES
  (1, 'work_arrangement', 'on-site'), (1, 'schedule', 'standard'), (1, 'travel', 'occasional'),
  (2, 'work_arrangement', 'remote'), (2, 'schedule', 'flexible'), (2, 'travel', 'occasional'),
  (3, 'work_arrangement', 'hybrid'), (3, 'schedule', 'standard'), (3, 'travel', 'occasional'),
  (4, 'work_arrangement', 'hybrid'), (4, 'schedule', 'flexible'), (4, 'travel', 'occasional'),
  (5, 'work_arrangement', 'on-site'), (5, 'schedule', 'night'), (5, 'travel', 'frequent'),
  (6, 'work_arrangement', 'hybrid'), (6, 'schedule', 'standard'), (6, 'travel', 'occasional');

-- ============================================================================
-- Candidate-Skill Relationships
-- (Uses subquery to look up skill IDs by normalized name)
-- ============================================================================
INSERT IGNORE INTO candidate_skills (candidate_id, skill_id)
SELECT 1, id FROM skills WHERE normalized = 'deduction'
UNION ALL SELECT 1, id FROM skills WHERE normalized = 'pattern-recognition'
UNION ALL SELECT 1, id FROM skills WHERE normalized = 'forensics'
UNION ALL SELECT 2, id FROM skills WHERE normalized = 'research'
UNION ALL SELECT 2, id FROM skills WHERE normalized = 'time-management'
UNION ALL SELECT 2, id FROM skills WHERE normalized = 'public-speaking'
UNION ALL SELECT 3, id FROM skills WHERE normalized = 'systems-design'
UNION ALL SELECT 3, id FROM skills WHERE normalized = 'rapid-prototyping'
UNION ALL SELECT 3, id FROM skills WHERE normalized = 'leadership'
UNION ALL SELECT 4, id FROM skills WHERE normalized = 'project-management'
UNION ALL SELECT 4, id FROM skills WHERE normalized = 'stakeholder-management'
UNION ALL SELECT 4, id FROM skills WHERE normalized = 'public-speaking'
UNION ALL SELECT 5, id FROM skills WHERE normalized = 'woodworking'
UNION ALL SELECT 5, id FROM skills WHERE normalized = 'minimalism'
UNION ALL SELECT 5, id FROM skills WHERE normalized = 'negotiation'
UNION ALL SELECT 6, id FROM skills WHERE normalized = 'systems-design'
UNION ALL SELECT 6, id FROM skills WHERE normalized = 'rapid-prototyping'
UNION ALL SELECT 6, id FROM skills WHERE normalized = 'chemistry'
UNION ALL SELECT 7, id FROM skills WHERE normalized = 'persuasion'
UNION ALL SELECT 7, id FROM skills WHERE normalized = 'research'
UNION ALL SELECT 7, id FROM skills WHERE normalized = 'public-speaking'
UNION ALL SELECT 8, id FROM skills WHERE normalized = 'rapid-prototyping'
UNION ALL SELECT 8, id FROM skills WHERE normalized = 'resourcefulness'
UNION ALL SELECT 8, id FROM skills WHERE normalized = 'chemistry'
UNION ALL SELECT 8, id FROM skills WHERE normalized = 'systems-design'
UNION ALL SELECT 9, id FROM skills WHERE normalized = 'theoretical-analysis'
UNION ALL SELECT 9, id FROM skills WHERE normalized = 'pattern-recognition'
UNION ALL SELECT 9, id FROM skills WHERE normalized = 'research'
UNION ALL SELECT 10, id FROM skills WHERE normalized = 'precision'
UNION ALL SELECT 10, id FROM skills WHERE normalized = 'strategy'
UNION ALL SELECT 10, id FROM skills WHERE normalized = 'crisis-management'
UNION ALL SELECT 11, id FROM skills WHERE normalized = 'sales'
UNION ALL SELECT 11, id FROM skills WHERE normalized = 'public-speaking'
UNION ALL SELECT 11, id FROM skills WHERE normalized = 'team-building'
UNION ALL SELECT 12, id FROM skills WHERE normalized = 'crisis-management'
UNION ALL SELECT 12, id FROM skills WHERE normalized = 'negotiation'
UNION ALL SELECT 12, id FROM skills WHERE normalized = 'strategy'
UNION ALL SELECT 12, id FROM skills WHERE normalized = 'leadership'
UNION ALL SELECT 13, id FROM skills WHERE normalized = 'team-building'
UNION ALL SELECT 13, id FROM skills WHERE normalized = 'optimism'
UNION ALL SELECT 13, id FROM skills WHERE normalized = 'mentorship'
UNION ALL SELECT 13, id FROM skills WHERE normalized = 'public-speaking'
UNION ALL SELECT 14, id FROM skills WHERE normalized = 'leadership'
UNION ALL SELECT 14, id FROM skills WHERE normalized = 'negotiation'
UNION ALL SELECT 14, id FROM skills WHERE normalized = 'stakeholder-management'
UNION ALL SELECT 14, id FROM skills WHERE normalized = 'precision'
UNION ALL SELECT 15, id FROM skills WHERE normalized = 'sales'
UNION ALL SELECT 15, id FROM skills WHERE normalized = 'negotiation'
UNION ALL SELECT 15, id FROM skills WHERE normalized = 'security'
UNION ALL SELECT 15, id FROM skills WHERE normalized = 'loyalty';

-- ============================================================================
-- Job-Required Skill Relationships
-- ============================================================================
INSERT IGNORE INTO job_required_skills (job_id, skill_id)
SELECT 1, id FROM skills WHERE normalized = 'deduction'
UNION ALL SELECT 1, id FROM skills WHERE normalized = 'pattern-recognition'
UNION ALL SELECT 1, id FROM skills WHERE normalized = 'forensics'
UNION ALL SELECT 2, id FROM skills WHERE normalized = 'rapid-prototyping'
UNION ALL SELECT 2, id FROM skills WHERE normalized = 'systems-design'
UNION ALL SELECT 3, id FROM skills WHERE normalized = 'public-speaking'
UNION ALL SELECT 3, id FROM skills WHERE normalized = 'research'
UNION ALL SELECT 4, id FROM skills WHERE normalized = 'team-building'
UNION ALL SELECT 4, id FROM skills WHERE normalized = 'stakeholder-management'
UNION ALL SELECT 4, id FROM skills WHERE normalized = 'leadership'
UNION ALL SELECT 5, id FROM skills WHERE normalized = 'crisis-management'
UNION ALL SELECT 5, id FROM skills WHERE normalized = 'strategy'
UNION ALL SELECT 5, id FROM skills WHERE normalized = 'negotiation'
UNION ALL SELECT 6, id FROM skills WHERE normalized = 'sales'
UNION ALL SELECT 6, id FROM skills WHERE normalized = 'public-speaking'
UNION ALL SELECT 6, id FROM skills WHERE normalized = 'negotiation';
