-- ════════════════════════════════════════════════════════════════════
-- DairyDirect Admin Portal — Supabase schema (Postgres)
-- Domain per the "Admin sidebar" spec (14 sections).
-- The app runs on a local mock layer by default (VITE_USE_SUPABASE=false).
-- ════════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ── §2 Stores & service areas ──────────────────────────────────
create table cities (
  id text primary key,
  name text not null unique,
  coords_lat numeric not null,
  coords_lng numeric not null
);

create table legal_entities (
  id text primary key,
  name text not null,
  gstin text not null,
  address text not null default '',
  invoice_prefix text not null default 'DDR'
);

create table stores (
  id text primary key,
  name text not null,
  location text not null,
  city_id text not null references cities(id),
  coords_lat numeric not null,
  coords_lng numeric not null,
  capacity_orders_per_day int not null default 100,
  status text not null default 'online' check (status in ('online','paused')),
  cod_available boolean not null default true,
  legal_entity_id text references legal_entities(id),
  manager_ids text[] not null default '{}',
  opened_on date not null default current_date,
  image_variant int not null default 0,
  weekly_hours jsonb not null default '[]'::jsonb,
  holidays jsonb not null default '[]'::jsonb,
  picking_backlog int not null default 0,
  note text
);

create table zones (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  city_id text not null references cities(id),
  name text not null,
  priority int not null check (priority between 1 and 3),
  pincodes text not null default '',
  polygon jsonb not null default '[]'::jsonb   -- [[lat,lng],...]
);

-- ── §3 Products & pricing ──────────────────────────────────────
create table product_categories ( id text primary key, name text not null );
create table brands ( id text primary key, name text not null );

create table products (
  id text primary key,
  name text not null,
  category_id text references product_categories(id),
  brand_id text references brands(id),
  description text not null default '',
  tax_rate_pct numeric not null default 0,
  shelf_life_days int not null default 7,
  storage text not null default 'chilled' check (storage in ('chilled','ambient','frozen')),
  image_variant int not null default 0,
  publish_state text not null default 'published' check (publish_state in ('published','unpublished')),
  subscribable boolean not null default false,
  pending_approval_id text,
  pending_change_label text
);

create table variants (
  id text primary key,
  product_id text not null references products(id) on delete cascade,
  label text not null,
  sku text not null unique,
  barcode text not null default '',
  price numeric not null check (price >= 0),
  active boolean not null default true
);

create table store_variants (
  variant_id text not null references variants(id) on delete cascade,
  store_id text not null references stores(id) on delete cascade,
  available boolean not null default true,
  price_override numeric,
  primary key (variant_id, store_id)
);

-- ── §4 Inventory ───────────────────────────────────────────────
create table stock_levels (
  store_id text not null references stores(id) on delete cascade,
  variant_id text not null references variants(id) on delete cascade,
  qty int not null default 0,
  low_stock_threshold int not null default 20,
  primary key (store_id, variant_id)
);

create table stock_batches (
  id text primary key,
  store_id text not null references stores(id) on delete cascade,
  variant_id text not null references variants(id) on delete cascade,
  qty int not null default 0,
  expiry_date date not null
);

create table inventory_movements (
  id text primary key,
  store_id text not null references stores(id),
  variant_id text not null references variants(id),
  type text not null check (type in ('receipt','sale','adjustment','damage','expiry','transfer')),
  qty_delta int not null,
  reason text not null default '',
  actor text not null default '',
  at timestamptz not null default now(),
  flagged boolean not null default false,
  flag_reason text check (flag_reason in ('unusual_adjustment','damage','expiry'))
);

-- ── People ─────────────────────────────────────────────────────
create table customers (
  id text primary key,
  name text not null,
  phone text not null,
  email text not null,
  city_id text references cities(id),
  avatar int not null default 0,
  joined_on date not null default current_date,
  status text not null default 'active' check (status in ('active','blocked')),
  blocked_reason text
);

create table workforce (
  id text primary key,
  name text not null,
  email text not null unique,
  phone text not null default '',
  role text not null check (role in ('admin','store_manager','rider','support_agent')),
  store_id text references stores(id),
  status text not null default 'active' check (status in ('active','blocked','invited')),
  last_login timestamptz,
  joined_on date not null default current_date,
  avatar int not null default 0,
  password_reset_requested boolean not null default false,
  pending_role_change_approval_id text
);

create table riders (
  id text primary key,
  name text not null,
  phone text not null,
  avatar int not null default 0,
  store_id text not null references stores(id),
  status text not null default 'application_pending'
    check (status in ('application_pending','application_approved','application_rejected','active','suspended')),
  applied_on date not null default current_date,
  vehicle text not null default '',
  documents jsonb not null default '[]'::jsonb,     -- [{type,status}]
  reviewed_by_store_manager boolean not null default false,
  review_note text,
  deliveries_period int not null default 0,
  rating numeric not null default 4.5
);

-- ── §5 Orders & delivery ───────────────────────────────────────
create table orders (
  id text primary key,
  store_id text not null references stores(id),
  customer_id text not null references customers(id),
  amount numeric not null check (amount > 0),
  delivery_fee numeric not null default 0,
  discount numeric not null default 0,
  payment_method text not null check (payment_method in ('online_upi','online_card','online_netbanking','wallet','cod')),
  status text not null check (status in ('placed','confirmed','picking','ready','out_for_delivery','delivered','cancelled','on_hold')),
  placed_at timestamptz not null,
  rider_id text references riders(id),
  delivery_code text not null default '',
  delivery_code_locked boolean not null default false,
  wrong_address_reported_at timestamptz,
  wrong_address_resolved_at timestamptz,
  requires_attention boolean not null default false,
  attention_reason text check (attention_reason in ('on_hold','wrong_address','code_locked','payment_failed')),
  hold_reason text,
  cancel_reason text,
  correction_requests jsonb not null default '[]'::jsonb,
  items jsonb not null default '[]'::jsonb,
  timeline jsonb not null default '{}'::jsonb
);

-- ── §7 Payments, refunds & wallets ─────────────────────────────
create table payment_attempts (
  id text primary key,
  order_id text not null references orders(id),
  attempt_no int not null default 1,
  method text not null check (method in ('online_upi','online_card','online_netbanking')),
  amount numeric not null,
  status text not null check (status in ('captured','failed','initiated')),
  gateway text not null default 'GatewayPro',
  gateway_ref text,
  failure_reason text,
  at timestamptz not null
);

create table refunds (
  id text primary key,
  order_id text not null references orders(id),
  amount numeric not null check (amount > 0),
  status text not null check (status in ('requested','processing','paid','failed')),
  reason text not null default '',
  source text not null check (source in ('admin','support','system','customer')),
  created_at timestamptz not null,
  paid_at timestamptz,
  evidence jsonb      -- {reference, fileName}
);

create table wallet_ledger (
  id text primary key,
  customer_id text not null references customers(id),
  customer_name text not null default '',
  type text not null check (type in ('topup','order_payment','refund_credit','adjustment')),
  amount numeric not null,
  balance_after numeric not null,
  reason text not null default '',
  at timestamptz not null default now(),
  authorized_by text
);

create table reconciliation_findings (
  id text primary key,
  kind text not null check (kind in ('mismatch','unresolved_payment','missing_payout')),
  ref text not null,
  summary text not null,
  expected numeric not null default 0,
  actual numeric not null default 0,
  status text not null default 'open' check (status in ('open','investigating','resolved')),
  note text,
  at timestamptz not null default now()
);

create table invoice_failures (
  id text primary key,
  invoice_id text not null,
  order_id text,
  reason text not null,
  status text not null default 'suspended' check (status in ('suspended','rendering')),
  cause_fixed boolean not null default false,
  at timestamptz not null default now()
);

-- ── §8 Rider payouts & COD ─────────────────────────────────────
create table payouts (
  id text primary key,
  rider_id text not null references riders(id),
  rider_name text not null default '',
  store_id text references stores(id),
  period text not null,
  deliveries_count int not null default 0,
  gross_amount numeric not null default 0,
  cod_collected numeric not null default 0,
  adjustments numeric not null default 0,
  net_amount numeric not null default 0,
  status text not null default 'pending_review'
    check (status in ('pending_review','approved','processing','paid','failed','on_hold')),
  can_approve boolean not null default false,
  approved_at timestamptz,
  paid_at timestamptz,
  payment_reference text,
  evidence_file_name text,
  hold_reason text
);

create table payout_corrections (
  id text primary key,
  payout_id text not null references payouts(id) on delete cascade,
  kind text not null check (kind in ('correction','cod_offset')),
  amount numeric not null,
  reason text not null default '',
  at timestamptz not null default now()
);

-- ── §9 Offers & notifications ──────────────────────────────────
create table coupons (
  id text primary key,
  code text not null unique,
  kind text not null check (kind in ('percentage','flat','free_delivery')),
  value numeric not null default 0,
  min_order_value numeric not null default 0,
  starts_on date not null,
  ends_on date not null,
  usage_limit int not null default 100,
  used_count int not null default 0,
  eligible_store_ids text[] not null default '{}',
  eligible_product_ids text[] not null default '{}',
  status text not null default 'active' check (status in ('active','inactive','scheduled','expired'))
);

create table push_campaigns (
  id text primary key,
  name text not null,
  audience text not null check (audience in ('all_customers','subscription_users','selected_users')),
  selected_user_ids text[] not null default '{}',
  title text not null,
  body text not null default '',
  status text not null default 'draft' check (status in ('draft','scheduled','sent')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipients int not null default 0
);

create table admin_notifications (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text not null default '',
  kind text not null check (kind in ('order','store','payout','approval','support','system')),
  read boolean not null default false,
  at timestamptz not null default now()
);

-- ── §10 Subscriptions ──────────────────────────────────────────
create table delivery_slots (
  id text primary key,
  label text not null,
  window text not null
);

create table subscription_holidays (
  date date primary key,
  name text not null
);

create table subscription_runs (
  id text primary key,
  date timestamptz not null,
  generated int not null default 0,
  status text not null check (status in ('completed','partial','failed')),
  failures jsonb not null default '[]'::jsonb
);

-- ── §11 Support & reviews ──────────────────────────────────────
create table saved_responses (
  id text primary key,
  title text not null,
  body text not null
);

create table tickets (
  id text primary key,
  ref text not null unique,
  subject text not null,
  category text not null check (category in ('order_issue','payment','refund_request','account','product_quality','other')),
  status text not null default 'open' check (status in ('open','pending','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  customer_id text references customers(id),
  customer_name text not null default '',
  order_id text references orders(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  messages jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb
);

create table ratings (
  id text primary key,
  order_id text references orders(id),
  store_id text references stores(id),
  customer_name text not null default '',
  stars int not null check (stars between 1 and 5),
  comment text not null default '',
  at timestamptz not null default now(),
  moderation_required boolean not null default false,
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','removed')),
  moderation_reason text
);

-- ── §12 Reports & exports ──────────────────────────────────────
create table export_jobs (
  id text primary key,
  tab text not null check (tab in ('catalog_stock','financial','picking','rider_activity','subscriptions','support')),
  label text not null,
  filters_summary text not null default '',
  status text not null default 'pending' check (status in ('pending','complete','failed')),
  row_count int,
  file_name text,
  authorized boolean not null default true,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);

-- ── §13 Approvals & compliance ─────────────────────────────────
create table approvals (
  id text primary key,
  action text not null,
  target_type text not null check (target_type in ('variant_price','workforce_role','product_publish','refund_override','coupon_config','business_rule')),
  target_label text not null,
  details text not null default '',
  reason text not null default '',
  requester_name text not null,
  requester_role text not null default '',
  status text not null default 'pending' check (status in ('pending','completed','rejected','expired')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  can_approve boolean not null default false,
  cannot_approve_reason text,
  expires_at timestamptz not null
);

create table fraud_findings (
  id text primary key,
  ref text not null,
  kind text not null check (kind in ('account_takeover','refund_abuse','promo_abuse','cod_shortfall')),
  risk_level text not null check (risk_level in ('low','medium','high')),
  summary text not null,
  status text not null default 'open' check (status in ('open','cleared','confirmed')),
  note text,
  at timestamptz not null default now()
);

create table erasure_requests (
  id text primary key,
  customer_id text not null references customers(id),
  customer_name text not null default '',
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','processing','completed','rejected')),
  eligible boolean not null default false,
  ineligible_reason text,
  note text
);

create table legal_holds (
  id text primary key,
  subject_name text not null,
  reason text not null,
  placed_at timestamptz not null default now(),
  released_at timestamptz,
  status text not null default 'active' check (status in ('active','released'))
);

-- ── §14 Settings & system ──────────────────────────────────────
create table system_settings (
  id int primary key default 1 check (id = 1),
  features jsonb not null default '{"cod":true,"wallets":true,"subscriptions":true}'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  subscription jsonb not null default '{}'::jsonb
);

create table background_jobs (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('invoice_render','payout_export','subscription_generate','webhook_delivery','report_email')),
  status text not null default 'failed' check (status in ('failed','running','completed','retrying')),
  last_run_at timestamptz not null default now(),
  attempts int not null default 0,
  error text,
  recovery text not null default 'retry' check (recovery in ('retry','requeue','skip')),
  can_retry boolean not null default false,
  retry_after_fix text
);

create table operational_notifications (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  body text not null default '',
  severity text not null check (severity in ('info','warning','critical')),
  at timestamptz not null default now()
);

-- ════════════════════════════════════════════════════════════════════
-- Row Level Security — single Admin role model
-- (Admin, Store manager, Rider, Support agent, Customer)
-- ════════════════════════════════════════════════════════════════════
do $$ declare t text; begin
  foreach t in array array['cities','legal_entities','stores','zones','product_categories','brands',
    'products','variants','store_variants','stock_levels','stock_batches','inventory_movements',
    'customers','workforce','riders','orders','payment_attempts','refunds','wallet_ledger',
    'reconciliation_findings','invoice_failures','payouts','payout_corrections','coupons',
    'push_campaigns','admin_notifications','delivery_slots','subscription_holidays','subscription_runs',
    'saved_responses','tickets','ratings','export_jobs','approvals','fraud_findings','erasure_requests',
    'legal_holds','system_settings','background_jobs','operational_notifications']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "staff_read" on %I for select to authenticated using (true)', t);
  end loop;
end $$;

create or replace function is_admin() returns boolean language sql stable as $$
  select exists (select 1 from workforce w where w.email = auth.jwt() ->> 'email' and w.role = 'admin' and w.status = 'active');
$$;

-- Write paths: only the Admin mutates master data; operational inserts allowed to staff.
do $$ declare t text; begin
  foreach t in array array['cities','legal_entities','stores','zones','product_categories','brands',
    'products','variants','store_variants','stock_levels','customers','workforce','riders','orders',
    'refunds','wallet_ledger','payouts','payout_corrections','coupons','push_campaigns','tickets',
    'ratings','export_jobs','approvals','fraud_findings','erasure_requests','legal_holds',
    'system_settings','background_jobs','reconciliation_findings','invoice_failures','stock_batches']
  loop
    execute format('drop policy if exists "admin_write" on %I', t);
    execute format('create policy "admin_write" on %I for all to authenticated using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

create policy "staff_insert_notifications" on admin_notifications for insert to authenticated with check (true);
create policy "staff_update_notifications" on admin_notifications for update to authenticated using (true) with check (true);
create policy "staff_insert_audit" on operational_notifications for insert to authenticated with check (true);
