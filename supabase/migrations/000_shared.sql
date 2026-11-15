-- ════════════════════════════════════════════════════════════════════
-- DairyDirect — migration 000_shared.sql (Postgres / Supabase)
-- Reference + master data used by BOTH apps: stores & service areas,
-- products & pricing, inventory levels, and the workforce table (auth/roles).
-- Run order: 000_shared → 100_admin → 200_store.
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


-- ── Workforce (shared: auth + roles for admin-web AND store-web) ──
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

