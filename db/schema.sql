-- FraudGuard database schema (PostgreSQL / Neon)
-- Safe to run more than once: every statement uses "if not exists".

create table if not exists users (
  id            serial primary key,
  name          text not null,
  email         text not null unique,
  password_hash text not null,
  role          text not null check (role in ('employee','manager','procurement','accountant','finance_manager','auditor')),
  department    text not null default 'General',
  created_at    timestamptz not null default now()
);

create table if not exists suppliers (
  id              serial primary key,
  name            text not null unique,
  status          text not null default 'pending' check (status in ('pending','approved')),
  bank_name       text not null,
  account_holder  text not null,
  account_number  text not null,
  branch_code     text not null,
  bank_changed_at timestamptz,
  verified_by     int references users(id),
  verified_at     timestamptz,
  created_by      int references users(id),
  created_at      timestamptz not null default now()
);

-- Keeps the bank details that were replaced, so "what changed" can always be answered.
create table if not exists supplier_bank_history (
  id             serial primary key,
  supplier_id    int not null references suppliers(id) on delete cascade,
  bank_name      text not null,
  account_holder text not null,
  account_number text not null,
  branch_code    text not null,
  changed_by     int references users(id),
  changed_at     timestamptz not null default now()
);

-- Normal spending ceiling per category (used by the "above normal" rule)
-- and the ledger account that category is posted to.
create table if not exists category_norms (
  category        text primary key,
  normal_max      numeric(14,2) not null,
  ledger_account  text not null
);

create table if not exists purchase_requests (
  id             serial primary key,
  ref            text generated always as ('PR-' || lpad(id::text, 4, '0')) stored,
  requester_id   int not null references users(id),
  department     text not null,
  category       text not null references category_norms(category),
  item           text not null,
  quantity       int not null check (quantity > 0),
  estimated_cost numeric(14,2) not null check (estimated_cost > 0),
  reason         text not null,
  status         text not null default 'pending' check (status in ('pending','approved','rejected','ordered')),
  decided_by     int references users(id),
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now()
);

create table if not exists purchase_orders (
  id          serial primary key,
  ref         text generated always as ('PO-' || lpad(id::text, 4, '0')) stored,
  request_id  int not null unique references purchase_requests(id),
  supplier_id int not null references suppliers(id),
  quantity    int not null check (quantity > 0),
  unit_price  numeric(14,2) not null check (unit_price > 0),
  total       numeric(14,2) not null,
  status      text not null default 'issued' check (status in ('issued','received','invoiced','paid')),
  created_by  int references users(id),
  created_at  timestamptz not null default now()
);

create table if not exists goods_received (
  id          serial primary key,
  ref         text generated always as ('GRN-' || lpad(id::text, 4, '0')) stored,
  po_id       int not null references purchase_orders(id),
  quantity    int not null check (quantity > 0),
  notes       text,
  received_by int references users(id),
  received_at timestamptz not null default now()
);

create table if not exists invoices (
  id             serial primary key,
  ref            text generated always as ('AP-' || lpad(id::text, 4, '0')) stored,
  po_id          int not null references purchase_orders(id),
  supplier_id    int not null references suppliers(id),
  invoice_number text not null,
  invoice_date   date not null,
  quantity       int not null check (quantity > 0),
  unit_price     numeric(14,2) not null check (unit_price > 0),
  total          numeric(14,2) not null,
  bank_name      text not null,
  account_holder text not null,
  account_number text not null,
  branch_code    text not null,
  captured_by    int references users(id),
  captured_at    timestamptz not null default now(),
  match_status   text not null check (match_status in ('matched','mismatch')),
  risk_score     int not null check (risk_score between 0 and 100),
  risk_band      text not null check (risk_band in ('low','medium','high')),
  status         text not null check (status in ('approved','held','paid','rejected')),
  paid_by        int references users(id),
  paid_at        timestamptz
);
create index if not exists invoices_supplier_idx on invoices (supplier_id, captured_at);

create table if not exists alerts (
  id          serial primary key,
  ref         text generated always as ('AL-' || lpad(id::text, 4, '0')) stored,
  invoice_id  int not null unique references invoices(id),
  score       int not null,
  band        text not null check (band in ('medium','high')),
  reasons     jsonb not null,
  snapshot    jsonb not null,
  status      text not null default 'open' check (status in ('open','escalated','cleared','rejected')),
  created_at  timestamptz not null default now(),
  resolved_by int references users(id),
  resolved_at timestamptz,
  comment     text
);

create table if not exists journal_entries (
  id          serial primary key,
  ref         text generated always as ('JE-' || lpad(id::text, 4, '0')) stored,
  invoice_id  int references invoices(id),
  description text not null,
  posted_by   int references users(id),
  posted_at   timestamptz not null default now()
);

create table if not exists journal_lines (
  id       serial primary key,
  entry_id int not null references journal_entries(id) on delete cascade,
  account  text not null,
  debit    numeric(14,2) not null default 0 check (debit >= 0),
  credit   numeric(14,2) not null default 0 check (credit >= 0)
);

-- Who did what, and when. Rows are only ever inserted, never updated.
create table if not exists audit_log (
  id         bigserial primary key,
  at         timestamptz not null default now(),
  user_id    int,
  user_name  text not null,
  user_role  text not null,
  action     text not null,
  entity     text not null,
  entity_ref text,
  details    jsonb not null default '{}'::jsonb
);
create index if not exists audit_log_at_idx on audit_log (at desc);

-- Small Civils and VZ Coatings: one business, two companies. Added so every request, order,
-- invoice and audit entry says which company it belongs to. Safe to run again: existing rows
-- default to Small Civils and can be corrected afterwards.
alter table purchase_requests add column if not exists company text not null default 'small_civils' check (company in ('small_civils','vz_coatings'));
alter table purchase_orders   add column if not exists company text not null default 'small_civils' check (company in ('small_civils','vz_coatings'));
alter table invoices          add column if not exists company text not null default 'small_civils' check (company in ('small_civils','vz_coatings'));
alter table audit_log         add column if not exists company text check (company in ('small_civils','vz_coatings'));
create index if not exists purchase_requests_company_idx on purchase_requests (company);
create index if not exists purchase_orders_company_idx on purchase_orders (company);
create index if not exists invoices_company_idx on invoices (company);
create index if not exists audit_log_company_idx on audit_log (company);
