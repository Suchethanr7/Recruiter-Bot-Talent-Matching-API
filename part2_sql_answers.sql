-- Question 1
SELECT
    j.id AS job_id,
    j.title,
    r.name AS recruiter
FROM job_postings j
JOIN recruiters r ON r.id = j.recruiter_id
WHERE j.status = 'open'
ORDER BY j.id;

-- Question 2
SELECT
    j.id AS job_id,
    j.title,
    COUNT(DISTINCT i.applicant_id) AS final_applicants
FROM job_postings j
LEFT JOIN interviews i
    ON i.job_posting_id = j.id
    AND i.stage = 'Final'
GROUP BY j.id, j.title
ORDER BY j.id;

-- Question 3
-- The duplicate Ananya records have email addresses with different casing,
-- so compare normalized emails. Interview rows show which jobs they reached.
SELECT
    LOWER(TRIM(a.email)) AS email,
    MIN(a.full_name) AS person,
    COUNT(DISTINCT i.job_posting_id) AS jobs_applied_to
FROM applicants a
JOIN interviews i ON i.applicant_id = a.id
WHERE a.email IS NOT NULL
GROUP BY LOWER(TRIM(a.email))
HAVING COUNT(DISTINCT i.job_posting_id) > 1
ORDER BY jobs_applied_to DESC, email;

-- Question 4
SELECT
    r.name AS recruiter,
    COUNT(*) AS final_interviews,
    SUM(i.outcome = 'passed') AS passed_interviews,
    ROUND(100.0 * SUM(i.outcome = 'passed') / COUNT(*), 2) AS conversion_rate_pct
FROM recruiters r
JOIN job_postings j ON j.recruiter_id = r.id
JOIN interviews i ON i.job_posting_id = j.id
WHERE i.stage = 'Final'
GROUP BY r.id, r.name
HAVING COUNT(*) >= 3
ORDER BY conversion_rate_pct DESC, r.name;

-- Question 5 (Bonus)
WITH placements AS (
    SELECT
        j.department,
        r.id AS recruiter_id,
        r.name AS recruiter,
        COUNT(i.id) AS successful_placements
    FROM recruiters r
    JOIN job_postings j ON j.recruiter_id = r.id
    LEFT JOIN interviews i
        ON i.job_posting_id = j.id
        AND i.stage = 'Final'
        AND i.outcome = 'passed'
    GROUP BY j.department, r.id, r.name
),
ranked AS (
    SELECT
        department,
        recruiter_id,
        recruiter,
        successful_placements,
        RANK() OVER (
            PARTITION BY department
            ORDER BY successful_placements DESC
        ) AS department_rank
    FROM placements
)
SELECT department, recruiter_id, recruiter, successful_placements
FROM ranked
WHERE department_rank = 1
ORDER BY department, recruiter_id;
