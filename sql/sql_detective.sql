-- ============================================================================
-- SQL Detective Challenge
-- Uses the assignment's four-table schema: recruiters, job_postings,
-- applicants, interviews
-- ============================================================================

-- ============================================================================
-- Question 1: List currently open job postings and the recruiter responsible
-- ============================================================================
SELECT
    jp.id            AS job_posting_id,
    jp.title         AS job_title,
    jp.department,
    jp.status,
    r.id             AS recruiter_id,
    r.name           AS recruiter_name,
    r.email          AS recruiter_email
FROM job_postings jp
JOIN recruiters r ON r.id = jp.recruiter_id
WHERE jp.status = 'Open'
ORDER BY jp.department, jp.title;

-- ============================================================================
-- Question 2: For every job posting, count the distinct applicants who
-- reached the Final interview stage, including jobs with zero Final-stage
-- applicants.
-- ============================================================================
SELECT
    jp.id            AS job_posting_id,
    jp.title         AS job_title,
    jp.department,
    COUNT(DISTINCT CASE WHEN i.interview_stage = 'Final' THEN a.id END) AS final_stage_applicants
FROM job_postings jp
LEFT JOIN interviews i
    ON i.job_posting_id = jp.id
    AND i.interview_stage = 'Final'
LEFT JOIN applicants a
    ON a.id = i.applicant_id
GROUP BY jp.id, jp.title, jp.department
ORDER BY final_stage_applicants DESC, jp.title;

-- ============================================================================
-- Question 3: Find people who applied to more than one job posting.
-- Identity-matching rule: We use LOWER(TRIM(email)) to identify unique
-- individuals. This handles the case where "Ananya Rao" appears with
-- different applicant IDs but the same email address (a known duplicate in
-- the supplied data). Two applicant rows sharing a normalized email are
-- considered the same person.
-- ============================================================================
SELECT
    LOWER(TRIM(a.email))   AS normalized_email,
    MIN(a.name)            AS applicant_name,
    COUNT(DISTINCT i.job_posting_id) AS jobs_applied_to,
    GROUP_CONCAT(DISTINCT jp.title ORDER BY jp.title SEPARATOR ', ') AS job_titles
FROM applicants a
JOIN interviews i ON i.applicant_id = a.id
JOIN job_postings jp ON jp.id = i.job_posting_id
GROUP BY LOWER(TRIM(a.email))
HAVING COUNT(DISTINCT i.job_posting_id) > 1
ORDER BY jobs_applied_to DESC, normalized_email;

-- ============================================================================
-- Question 4: Calculate each recruiter's Final-stage conversion rate.
-- Conversion rate = (passed Final-stage interviews) / (all Final-stage interviews)
-- Include only recruiters with at least three Final-stage interviews.
-- We define "passed" as interview_result = 'Pass' (or 'Hired') at the Final stage.
-- ============================================================================
SELECT
    r.id               AS recruiter_id,
    r.name             AS recruiter_name,
    COUNT(*)           AS total_final_interviews,
    SUM(CASE WHEN i.interview_result IN ('Pass', 'Hired') THEN 1 ELSE 0 END) AS passed_final_interviews,
    ROUND(
        SUM(CASE WHEN i.interview_result IN ('Pass', 'Hired') THEN 1 ELSE 0 END) * 100.0
        / COUNT(*), 2
    ) AS conversion_rate_pct
FROM recruiters r
JOIN job_postings jp ON jp.recruiter_id = r.id
JOIN interviews i ON i.job_posting_id = jp.id
WHERE i.interview_stage = 'Final'
GROUP BY r.id, r.name
HAVING COUNT(*) >= 3
ORDER BY conversion_rate_pct DESC, r.name;

-- ============================================================================
-- Question 5: Use a window function to find the recruiter with the most
-- successful Final-stage placements per department.
-- Ties are handled explicitly: all tied recruiters are returned (RANK).
-- A "successful Final-stage placement" = interview_result IN ('Pass','Hired')
-- at the Final stage.
-- ============================================================================
WITH recruiter_dept_placements AS (
    SELECT
        jp.department,
        r.id             AS recruiter_id,
        r.name           AS recruiter_name,
        COUNT(*)         AS successful_placements,
        RANK() OVER (
            PARTITION BY jp.department
            ORDER BY COUNT(*) DESC
        ) AS dept_rank
    FROM recruiters r
    JOIN job_postings jp ON jp.recruiter_id = r.id
    JOIN interviews i ON i.job_posting_id = jp.id
    WHERE i.interview_stage = 'Final'
      AND i.interview_result IN ('Pass', 'Hired')
    GROUP BY jp.department, r.id, r.name
)
SELECT
    department,
    recruiter_id,
    recruiter_name,
    successful_placements,
    dept_rank
FROM recruiter_dept_placements
WHERE dept_rank = 1
ORDER BY department, recruiter_name;
