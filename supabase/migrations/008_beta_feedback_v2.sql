-- 008_beta_feedback_v2.sql
-- Revise beta_feedback schema: rename category → feedback_type with new
-- allowed values (bug|idea|confusing|other), make rating nullable (removed
-- from form), add page_path.

-- rating is no longer collected — make nullable to preserve any existing rows
alter table beta_feedback alter column rating drop not null;

-- rename category → feedback_type
alter table beta_feedback rename column category to feedback_type;

-- swap check constraint to new values
alter table beta_feedback drop constraint if exists beta_feedback_category_check;

-- migrate any legacy values before adding new constraint
alter table beta_feedback alter column feedback_type set default 'other';
update beta_feedback
  set feedback_type = 'other'
  where feedback_type not in ('bug', 'idea', 'confusing', 'other');

alter table beta_feedback
  add constraint beta_feedback_type_check
  check (feedback_type in ('bug', 'idea', 'confusing', 'other'));

-- page the user was on when they submitted feedback
alter table beta_feedback add column if not exists page_path text;
