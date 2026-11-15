-- ════════════════════════════════════════════════════════════════════
-- DairyDirect — migration 200_store.sql (store-web domain)
-- Store portal tables: picking, returns, store inventory ops, rider
-- applications & documents, COD deposits, store status, notifications.
-- ════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════
-- Store Manager Portal tables (per spec §3) — append to base schema
-- ════════════════════════════════════════════════════════════════════

create table store_managers (
  id text primary key,
  workforce_id text not null references workforce(id) on delete cascade,
  store_id text not null references stores(id) on delete cascade,
  unique (workforce_id, store_id)
);

create table picking_tasks (
  id text primary key,
  order_id text not null references orders(id),
  store_id text not null references stores(id),
  status text not null default 'waiting_to_pick'
    check (status in ('waiting_to_pick','being_picked','ready_to_pack','ready_for_handover','completed','cancelled')),
  assignee_id text references workforce(id),
  claimed_at timestamptz,
  deadline timestamptz not null,
  created_at timestamptz not null default now(),
  packing jsonb,            -- {bags, coldChain, packedBy, notes}
  handover jsonb,           -- {riderId, riderName, code, verifiedAt, attempts}
  completed_at timestamptz
);

create table task_assignments (
  id uuid primary key default uuid_generate_v4(),
  task_id text not null references picking_tasks(id) on delete cascade,
  assignee_id text not null references workforce(id),
  assigned_at timestamptz not null default now(),
  released_at timestamptz
);

create table pick_lines (
  id text primary key,
  task_id text not null references picking_tasks(id) on delete cascade,
  variant_id text not null references variants(id),
  name text not null,
  qty_ordered int not null,
  qty_picked int not null default 0,
  batch_id text not null default '',
  batch_expiry date,
  substitution_variant_id text references variants(id),
  unavailable_reason text,
  resolved boolean not null default false
);

create table substitutions (
  id uuid primary key default uuid_generate_v4(),
  pick_line_id text not null references pick_lines(id) on delete cascade,
  variant_id text not null references variants(id),
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table packing_details (
  id uuid primary key default uuid_generate_v4(),
  task_id text not null references picking_tasks(id) on delete cascade,
  bags int not null default 1,
  cold_chain boolean not null default false,
  packed_by text not null default '',
  notes text,
  created_at timestamptz not null default now()
);

create table handovers (
  id uuid primary key default uuid_generate_v4(),
  task_id text not null references picking_tasks(id) on delete cascade,
  rider_id text references riders(id),
  code text not null,
  verified_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create table returns (
  id text primary key,
  order_id text not null references orders(id),
  store_id text not null references stores(id),
  returned_at timestamptz not null default now(),
  reason text not null check (reason in ('customer_unavailable','wrong_address','delivery_refused','rider_could_not_deliver','other')),
  status text not null default 'pending' check (status in ('pending','under_inspection','processed')),
  stock_action text check (stock_action in ('quarantine','write_off')),
  note text,
  draft boolean not null default false,
  processed_at timestamptz
);

create table return_items (
  id uuid primary key default uuid_generate_v4(),
  return_id text not null references returns(id) on delete cascade,
  variant_id text not null references variants(id),
  name text not null default '',
  qty int not null,
  batch_id text not null default '',
  decision text check (decision in ('saleable','damaged','expired'))
);

create table quality_decisions (
  id uuid primary key default uuid_generate_v4(),
  return_item_id uuid not null references return_items(id) on delete cascade,
  decision text not null check (decision in ('saleable','damaged','expired')),
  decided_by text not null default '',
  at timestamptz not null default now()
);

create table inventory_batches (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  variant_id text not null references variants(id) on delete cascade,
  qty int not null default 0,
  expiry_date date not null,
  bin_location text not null default ''
);

create table stock_receipts (
  id text primary key,
  store_id text not null references stores(id),
  variant_id text not null references variants(id),
  batch_no text not null,
  expiry_date date not null,
  qty int not null check (qty > 0),
  bin_location text not null default '',
  at timestamptz not null default now(),
  by text not null default ''
);

create table bin_locations (
  store_id text not null references stores(id) on delete cascade,
  bin text not null,
  primary key (store_id, bin)
);

create table stock_counts (
  id text primary key,
  store_id text not null references stores(id),
  started_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open','completed')),
  lines jsonb not null default '[]'::jsonb
);

create table stock_adjustments (
  id text primary key,
  store_id text not null references stores(id),
  variant_id text not null references variants(id),
  delta int not null,
  reason text not null,
  by text not null default '',
  at timestamptz not null default now(),
  approval_status text not null default 'pending' check (approval_status in ('pending','approved','rejected')),
  approval_id text
);

create table rider_applications (
  id text primary key,
  store_id text not null references stores(id),
  rider_name text not null,
  phone text not null,
  email text not null default '',
  vehicle jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','under_review','approved','rejected'))
);

create table rider_documents (
  id uuid primary key default uuid_generate_v4(),
  application_id text not null references rider_applications(id) on delete cascade,
  type text not null check (type in ('license','vehicle_rc','aadhaar','insurance')),
  label text not null,
  number text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_at timestamptz,
  reason text,
  file_path text   -- private storage object; apps open it via short-lived signed URLs
);

create table cod_deposits (
  id text primary key,
  store_id text not null references stores(id),
  rider_id text references riders(id),
  rider_name text not null default '',
  amount numeric not null check (amount > 0),
  reference text not null unique,
  outcome text not null default 'received' check (outcome in ('received','pending_verification','discrepancy')),
  remarks text,
  at timestamptz not null default now()
);

create table store_status_changes (
  id text primary key,
  store_id text not null references stores(id),
  status text not null check (status in ('online','paused')),
  by text not null default '',
  role text not null default '',
  at timestamptz not null default now(),
  reason text
);

create table notifications (
  id uuid primary key default uuid_generate_v4(),
  store_id text references stores(id),
  title text not null,
  body text not null default '',
  kind text not null check (kind in ('action','operational','system')),
  requires_action boolean not null default false,
  read boolean not null default false,
  at timestamptz not null default now(),
  link text
);

create table notification_preferences (
  workforce_id text primary key references workforce(id) on delete cascade,
  picking_orders boolean not null default true,
  inventory_alerts boolean not null default true,
  rider_applications boolean not null default true,
  _status boolean not null default true
);

