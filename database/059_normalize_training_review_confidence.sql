UPDATE workout_ai_reviews
SET confidence = CASE
  WHEN confidence < 0 THEN 0
  WHEN confidence > 1 THEN LEAST(confidence / 100, 1)
  ELSE confidence
END
WHERE confidence < 0 OR confidence > 1;

ALTER TABLE workout_ai_reviews
  VALIDATE CONSTRAINT workout_ai_reviews_confidence_check;
