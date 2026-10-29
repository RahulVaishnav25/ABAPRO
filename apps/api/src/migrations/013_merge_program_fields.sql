-- Migration 010 added new program columns beside older ones with the same meaning.
-- Keep one column for each and merge the data before dropping the other.

-- "Date implemented" was written to both columns.
UPDATE client_programs
SET date_implemented = started_on
WHERE date_implemented IS NULL AND started_on IS NOT NULL;

-- The form edits teaching_steps, but teaching_procedure is the versioned column.
-- When both hold different text, keep both rather than lose either.
UPDATE client_programs
SET teaching_procedure = CASE
  WHEN teaching_procedure = '' OR teaching_procedure = teaching_steps THEN teaching_steps
  ELSE teaching_steps || E'\n\n' || teaching_procedure
END
WHERE teaching_steps <> '';

ALTER TABLE client_programs
  DROP COLUMN started_on,
  DROP COLUMN teaching_steps;
