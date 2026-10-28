-- 007: finance, expenses, suppliers and inventory
CREATE TABLE fee_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  billing_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly'
    CHECK (billing_frequency IN ('weekly','monthly','termly','annual')),
  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fee_plan_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_plan_id UUID NOT NULL REFERENCES fee_plans(id) ON DELETE CASCADE,
  description VARCHAR(200) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  billing_rule VARCHAR(60) NOT NULL DEFAULT 'per_month'
);

CREATE TABLE invoice_counters (
  organisation_id UUID PRIMARY KEY REFERENCES organisations(id) ON DELETE CASCADE,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  invoice_number VARCHAR(60) NOT NULL,
  learner_id UUID REFERENCES learners(id) ON DELETE SET NULL,
  guardian_id UUID REFERENCES guardians(id) ON DELETE SET NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  subtotal NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','issued','partially_paid','paid','overdue','void','cancelled','written_off')),
  description VARCHAR(255),
  issued_at TIMESTAMPTZ,
  due_at DATE,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, invoice_number)
);
CREATE INDEX ix_invoices_org_status ON invoices(organisation_id, status);
CREATE INDEX ix_invoices_guardian ON invoices(guardian_id);

CREATE TABLE invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description VARCHAR(200) NOT NULL,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount NUMERIC(12,2) NOT NULL CHECK (unit_amount >= 0),
  line_total NUMERIC(12,2) NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  guardian_id UUID REFERENCES guardians(id) ON DELETE SET NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(20) NOT NULL
    CHECK (payment_method IN ('eft','cash','card','debit_order','snapscan','other')),
  provider_reference VARCHAR(200),
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','reconciled','failed','reversed')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reconciled_by UUID REFERENCES users(id),
  reconciled_at TIMESTAMPTZ,
  idempotency_key VARCHAR(150),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, idempotency_key)
);

CREATE TABLE payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  allocated_amount NUMERIC(12,2) NOT NULL CHECK (allocated_amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payment_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL,
  event_id VARCHAR(200) NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}',
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  contact_details JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  description VARCHAR(255) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'ZAR',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approval_status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft','submitted','approved','rejected','paid')),
  approved_by UUID REFERENCES users(id),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'general',
  quantity_on_hand NUMERIC(12,2) NOT NULL DEFAULT 0,
  minimum_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit VARCHAR(30) NOT NULL DEFAULT 'units',
  storage_location VARCHAR(120),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE inventory_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  inventory_item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('received','issued','adjustment','write_off')),
  quantity_delta NUMERIC(12,2) NOT NULL,
  reference VARCHAR(120),
  notes TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
