-- Operational checklists attached to tasks.
--
-- Cleaning rounds, kitchen preparation, trip preparation and maintenance
-- routines are modelled as checklist items on a task so completion records
-- stay in one place and every tick is attributable and auditable.

CREATE TABLE task_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label VARCHAR(300) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_task_checklist_task ON task_checklist_items(task_id, sort_order);
CREATE INDEX ix_task_checklist_org ON task_checklist_items(organisation_id);
