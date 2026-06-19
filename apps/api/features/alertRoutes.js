async function handleAlertRoutes(req, res, user, url, helpers) {
  const { send, query } = helpers;
  if (req.method !== 'GET' || url.pathname !== '/api/alerts') return false;

  const overduePayments = await query(
    `SELECT p.id, p.member_id, m.name AS member_name, p.amount_cents, p.due_date, current_date - p.due_date AS days_overdue
     FROM payments p
     INNER JOIN members m ON m.id = p.member_id
     WHERE p.gym_id = $1 AND p.status = 'pending' AND p.due_date < current_date
     ORDER BY p.due_date ASC LIMIT 50`,
    [user.gym_id]
  );

  const dueSoonMemberships = await query(
    `SELECT ms.id, ms.member_id, m.name AS member_name, ms.ends_at, ms.ends_at - current_date AS days_remaining
     FROM memberships ms
     INNER JOIN members m ON m.id = ms.member_id
     WHERE ms.gym_id = $1 AND ms.status = 'active' AND ms.ends_at BETWEEN current_date AND current_date + 7
     ORDER BY ms.ends_at ASC LIMIT 50`,
    [user.gym_id]
  );

  const trainingReviews = await query(
    `SELECT wp.id, wp.member_id, m.name AS member_name, wp.name AS plan_name, wp.starts_at, current_date - wp.starts_at AS age_days, wp.reviewed_at
     FROM workout_plans wp
     INNER JOIN members m ON m.id = wp.member_id
     WHERE wp.gym_id = $1 AND wp.status = 'active' AND current_date - wp.starts_at >= 80
     ORDER BY age_days DESC LIMIT 50`,
    [user.gym_id]
  );

  const assessmentDue = await query(
    `SELECT m.id AS member_id, m.name AS member_name, MAX(a.assessment_date) AS last_assessment_date,
      CASE WHEN MAX(a.assessment_date) IS NULL THEN NULL ELSE current_date - MAX(a.assessment_date) END AS days_since_last_assessment
     FROM members m
     LEFT JOIN member_assessments a ON a.member_id = m.id AND a.gym_id = m.gym_id
     WHERE m.gym_id = $1 AND m.status = 'active'
     GROUP BY m.id, m.name
     HAVING MAX(a.assessment_date) IS NULL OR current_date - MAX(a.assessment_date) >= 45
     ORDER BY last_assessment_date NULLS FIRST, m.name ASC LIMIT 50`,
    [user.gym_id]
  );

  const summary = {
    overdue_payments: overduePayments.rowCount,
    memberships_due_soon: dueSoonMemberships.rowCount,
    training_reviews_due: trainingReviews.rowCount,
    assessments_due: assessmentDue.rowCount,
    total: overduePayments.rowCount + dueSoonMemberships.rowCount + trainingReviews.rowCount + assessmentDue.rowCount
  };

  return send(res, 200, {
    summary,
    overdue_payments: overduePayments.rows,
    memberships_due_soon: dueSoonMemberships.rows,
    training_reviews_due: trainingReviews.rows,
    assessments_due: assessmentDue.rows
  });
}

module.exports = { handleAlertRoutes };
