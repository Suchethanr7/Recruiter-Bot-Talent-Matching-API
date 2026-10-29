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
INSERT IGNORE INTO candidates (id, name, experience, availability, quirk) VALUES
  (1,  'Sherlock H.',  8,  'Immediate',   'Solves problems by eliminating the impossible; occasionally insufferable in standups.'),
  (2,  'Hermione G.',  4,  '2 weeks',     'Reads the entire documentation before writing a single line of code.'),
  (3,  'Tony S.',      12, 'Not looking',  'Ships an MVP overnight, refuses to write tests.'),
  (4,  'Leslie K.',    6,  'Immediate',   'Has a binder for everything, including the binder.'),
  (5,  'Ron S.',       15, 'Not looking',  'Refuses to use more than one monitor.'),
  (6,  'Rick S.',      20, 'Immediate',   'Solution works, mechanism deeply concerning.'),
  (7,  'Elle W.',      3,  'Immediate',   'Underestimated in every standup, correct in every retro.'),
  (8,  'MacGyver',     10, '2 weeks',     'Fixes production outages with duct tape and a paperclip metaphor.'),
  (9,  'Sheldon C.',   9,  'Immediate',   'Correct 95% of the time, insufferable 100% of the time.'),
  (10, 'Katniss E.',   5,  'Immediate',   'Excellent under pressure, terrible with public speaking.'),
  (11, 'Michael S.',   11, 'Not looking',  'World''s best boss, according to a mug he bought himself.'),
  (12, 'Olivia P.',    13, '2 weeks',     'Handles it. Whatever it is.'),
  (13, 'Ted L.',       7,  'Immediate',   'Turns every technical setback into a folksy metaphor.'),
  (14, 'Miranda P.',   18, 'Not looking',  'Reviews every PR personally. Says nothing. Everyone panics.'),
  (15, 'Dwight S.',    9,  'Immediate',   'Assistant to the regional backend engineer.');

-- ============================================================================
-- Jobs (INSERT IGNORE on primary key preserves IDs, prevents duplicates)
-- ============================================================================
INSERT IGNORE INTO jobs (id, title, min_experience, tagline) VALUES
  (1, 'Backend Detective',                3,  'We have a bug. We have no leads. We have you.'),
  (2, 'Rapid Prototyping Engineer',        2,  'Ship first, document never (kidding — please document).'),
  (3, 'Developer Relations Lead',          2,  'Explain complex things to confused humans, cheerfully.'),
  (4, 'Engineering Manager, Chaos Team',   5,  'Herd cats. The cats are senior engineers.'),
  (5, 'Incident Commander',               4,  ' 3am page. You''re the one who picks up.'),
  (6, 'Sales Engineer',                    3,  'Sell the vision, then go build it.');

-- ============================================================================
-- Traits
-- ============================================================================
INSERT IGNORE INTO traits (name) VALUES
  ('analytical'), ('blunt'),
  ('detail-oriented'), ('overachiever'),
  ('confident'), ('innovative'),
  ('tenacious'), ('organized'),
  ('stubborn'), ('principled'),
  ('genius'), ('reckless'),
  ('optimistic'), ('sharp'),
  ('calm'), ('improviser'),
  ('rigid'), ('brilliant'),
  ('resilient'), ('decisive'),
  ('enthusiastic'), ('chaotic'),
  ('intense'), ('loyal'),
  ('empathetic'), ('persistent'),
  ('demanding');

-- ============================================================================
-- Culture Keywords
-- ============================================================================
INSERT IGNORE INTO culture_keywords (keyword) VALUES
  ('analytical'), ('autonomous'),
  ('innovative'), ('fast-paced'),
  ('energetic'), ('curious'),
  ('empathetic'), ('organized'),
  ('decisive'), ('calm-under-pressure'),
  ('enthusiastic'), ('persistent');

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

-- ============================================================================
-- Candidate-Trait Relationships
-- ============================================================================
INSERT IGNORE INTO candidate_traits (candidate_id, trait_id)
SELECT 1, id FROM traits WHERE normalized = 'analytical'
UNION ALL SELECT 1, id FROM traits WHERE normalized = 'blunt'
UNION ALL SELECT 2, id FROM traits WHERE normalized = 'detail-oriented'
UNION ALL SELECT 2, id FROM traits WHERE normalized = 'overachiever'
UNION ALL SELECT 3, id FROM traits WHERE normalized = 'confident'
UNION ALL SELECT 3, id FROM traits WHERE normalized = 'innovative'
UNION ALL SELECT 4, id FROM traits WHERE normalized = 'tenacious'
UNION ALL SELECT 4, id FROM traits WHERE normalized = 'organized'
UNION ALL SELECT 5, id FROM traits WHERE normalized = 'stubborn'
UNION ALL SELECT 5, id FROM traits WHERE normalized = 'principled'
UNION ALL SELECT 6, id FROM traits WHERE normalized = 'genius'
UNION ALL SELECT 6, id FROM traits WHERE normalized = 'reckless'
UNION ALL SELECT 7, id FROM traits WHERE normalized = 'optimistic'
UNION ALL SELECT 7, id FROM traits WHERE normalized = 'sharp'
UNION ALL SELECT 8, id FROM traits WHERE normalized = 'calm'
UNION ALL SELECT 8, id FROM traits WHERE normalized = 'improviser'
UNION ALL SELECT 9, id FROM traits WHERE normalized = 'rigid'
UNION ALL SELECT 9, id FROM traits WHERE normalized = 'brilliant'
UNION ALL SELECT 10, id FROM traits WHERE normalized = 'resilient'
UNION ALL SELECT 10, id FROM traits WHERE normalized = 'decisive'
UNION ALL SELECT 11, id FROM traits WHERE normalized = 'enthusiastic'
UNION ALL SELECT 11, id FROM traits WHERE normalized = 'chaotic'
UNION ALL SELECT 12, id FROM traits WHERE normalized = 'decisive'
UNION ALL SELECT 12, id FROM traits WHERE normalized = 'intense'
UNION ALL SELECT 13, id FROM traits WHERE normalized = 'empathetic'
UNION ALL SELECT 13, id FROM traits WHERE normalized = 'persistent'
UNION ALL SELECT 14, id FROM traits WHERE normalized = 'demanding'
UNION ALL SELECT 14, id FROM traits WHERE normalized = 'decisive'
UNION ALL SELECT 15, id FROM traits WHERE normalized = 'intense'
UNION ALL SELECT 15, id FROM traits WHERE normalized = 'loyal';

-- ============================================================================
-- Job-Culture Keyword Relationships
-- ============================================================================
INSERT IGNORE INTO job_culture_keywords (job_id, keyword_id)
SELECT 1, id FROM culture_keywords WHERE normalized = 'analytical'
UNION ALL SELECT 1, id FROM culture_keywords WHERE normalized = 'autonomous'
UNION ALL SELECT 2, id FROM culture_keywords WHERE normalized = 'innovative'
UNION ALL SELECT 2, id FROM culture_keywords WHERE normalized = 'fast-paced'
UNION ALL SELECT 3, id FROM culture_keywords WHERE normalized = 'energetic'
UNION ALL SELECT 3, id FROM culture_keywords WHERE normalized = 'curious'
UNION ALL SELECT 4, id FROM culture_keywords WHERE normalized = 'empathetic'
UNION ALL SELECT 4, id FROM culture_keywords WHERE normalized = 'organized'
UNION ALL SELECT 5, id FROM culture_keywords WHERE normalized = 'decisive'
UNION ALL SELECT 5, id FROM culture_keywords WHERE normalized = 'calm-under-pressure'
UNION ALL SELECT 6, id FROM culture_keywords WHERE normalized = 'enthusiastic'
UNION ALL SELECT 6, id FROM culture_keywords WHERE normalized = 'persistent';
