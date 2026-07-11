CREATE TABLE IF NOT EXISTS member_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'info',
  title text NOT NULL,
  message text NOT NULL,
  action_route text,
  read_at timestamptz,
  expires_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_notifications_member_created_idx
  ON member_notifications (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS member_notifications_unread_idx
  ON member_notifications (member_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS access_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES access_devices(id) ON DELETE CASCADE,
  command text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 seconds'),
  delivered_at timestamptz,
  completed_at timestamptz,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT access_commands_command_check CHECK (command IN ('unlock','test')),
  CONSTRAINT access_commands_status_check CHECK (status IN ('pending','delivered','completed','expired','failed'))
);

CREATE INDEX IF NOT EXISTS access_commands_device_status_idx
  ON access_commands (device_id, status, requested_at DESC);

CREATE INDEX IF NOT EXISTS access_commands_gym_requested_idx
  ON access_commands (gym_id, requested_at DESC);
