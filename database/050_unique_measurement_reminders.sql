CREATE UNIQUE INDEX IF NOT EXISTS member_notifications_measurement_reminder_unique_idx
  ON member_notifications (gym_id, member_id, type, ((metadata->>'reference_date')))
  WHERE type = 'measurement_reminder';
