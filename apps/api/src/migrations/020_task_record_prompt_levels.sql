-- Tasks with Prompt Used record one or more prompt levels instead of Yes or No.
-- A record holds either a response or prompt levels, never both and never neither.
-- response IS NOT NULL keeps a NULL response from making the check unknown, which would pass.

ALTER TABLE task_records
  ADD COLUMN prompt_levels text[] NOT NULL DEFAULT '{}';

ALTER TABLE task_records ALTER COLUMN response DROP NOT NULL;
ALTER TABLE task_records DROP CONSTRAINT task_records_response_check;

ALTER TABLE task_records
  ADD CONSTRAINT task_records_prompt_levels_check
    CHECK (prompt_levels <@ ARRAY['independent', 'full_prompt', 'partial_prompt', 'gesture_prompt', 'model_prompt', 'positional']::text[]),
  ADD CONSTRAINT task_records_response_check
    CHECK (
      (response IS NOT NULL AND response IN ('yes', 'no') AND cardinality(prompt_levels) = 0)
      OR (response IS NULL AND cardinality(prompt_levels) > 0)
    );
