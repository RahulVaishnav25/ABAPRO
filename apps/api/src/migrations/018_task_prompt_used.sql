-- Whether a prompt was used for the task. Existing tasks start unchecked.

ALTER TABLE client_targets
  ADD COLUMN IF NOT EXISTS prompt_used boolean NOT NULL DEFAULT false;
