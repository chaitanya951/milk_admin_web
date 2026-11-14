-- ════════════════════════════════════════════════════════════════════
-- DairyDirect — reference seed (run AFTER schema.sql)
-- Seeds the shared reference data for the new "Admin sidebar" domain.
-- The full demo dataset (stores, orders, payments, payouts, tickets,
-- approvals…) is generated deterministically by the mock layer
-- (src/data/seed.ts) — see README for mapping it into Supabase.
-- ════════════════════════════════════════════════════════════════════

-- Cities
insert into cities (id, name, coords_lat, coords_lng) values
  ('mumbai','Mumbai',19.0760,72.8777),
  ('pune','Pune',18.5204,73.8567),
  ('nashik','Nashik',19.9975,73.7898),
  ('nagpur','Nagpur',21.1458,79.0882),
  ('aurangabad','Aurangabad',19.8762,75.3433)
on conflict (id) do nothing;

-- Legal entities
insert into legal_entities (id, name, gstin, address, invoice_prefix) values
  ('le-1','DairyDirect Retail Pvt Ltd','27AABCD1234A1Z5','Unit 4, Trade Center, BKC, Mumbai 400051','DDR'),
  ('le-2','DairyDirect Logistics LLP','27AAFFD5678B1Z3','Plot 12, MIDC Andheri, Mumbai 400093','DDL'),
  ('le-3','DairyDirect Nashik Foods','27AACDN9012C1Z8','Satpur MIDC, Nashik 422007','DDN')
on conflict (id) do nothing;

-- Stores (COD unavailable on st-2 per spec fields; Powai carries the demo picking backlog)
insert into stores (id, name, location, city_id, coords_lat, coords_lng, capacity_orders_per_day, status, cod_available, legal_entity_id, manager_ids, opened_on, picking_backlog, note) values
  ('st-1','Colaba Fresh Store','Shop 7, Colaba Causeway, Mumbai','mumbai',19.0760,72.8777,260,'online',true,'le-1','{wf-2}','2023-01-05',3,'A store manager can pause/resume their own store; the admin controls wider configuration (capacity, COD, legal entity, zones).'),
  ('st-2','Andheri West Store','Unit 12, Lokhandwala, Andheri West, Mumbai','mumbai',19.1364,72.8297,200,'paused',false,'le-2','{wf-3}','2024-02-05',0,'A store manager can pause/resume their own store; the admin controls wider configuration (capacity, COD, legal entity, zones).'),
  ('st-3','Powai Store','G Block, Hiranandani Gardens, Powai, Mumbai','mumbai',19.1176,72.9060,240,'online',true,'le-1','{wf-4}','2025-03-05',38,'A store manager can pause/resume their own store; the admin controls wider configuration (capacity, COD, legal entity, zones).'),
  ('st-4','Baner Store','Survey 42, Baner Road, Pune','pune',18.5642,73.7769,220,'online',true,'le-1','{wf-5}','2023-04-05',6,'A store manager can pause/resume their own store; the admin controls wider configuration (capacity, COD, legal entity, zones).'),
  ('st-5','Kothrud Store','Karve Road, Kothrud, Pune','pune',18.5074,73.8077,180,'online',true,'le-1','{wf-6}','2024-05-05',4,'A store manager can pause/resume their own store; the admin controls wider configuration (capacity, COD, legal entity, zones).'),
  ('st-6','Panchavati Store','Gadhe Marg, Panchavati, Nashik','nashik',20.0014,73.7988,150,'online',true,'le-3','{wf-7}','2025-06-05',5,'A store manager can pause/resume their own store; the admin controls wider configuration (capacity, COD, legal entity, zones).'),
  ('st-7','Dharampeth Store','West High Court Road, Dharampeth, Nagpur','nagpur',21.1521,79.0764,130,'online',true,'le-1','{wf-8}','2023-07-05',2,'A store manager can pause/resume their own store; the admin controls wider configuration (capacity, COD, legal entity, zones).'),
  ('st-8','Nirala Bazaar Store','Nirala Bazaar, Aurangabad','aurangabad',19.8795,75.3398,120,'paused',true,'le-1','{wf-9}','2024-08-05',0,'A store manager can pause/resume their own store; the admin controls wider configuration (capacity, COD, legal entity, zones).')
on conflict (id) do nothing;

-- Product categories & brands
insert into product_categories (id, name) values
  ('cat-milk','Milk'),('cat-paneer','Paneer & Cheese'),('cat-ghee','Ghee & Oils'),
  ('cat-curd','Curd & Cultured'),('cat-other','Other')
on conflict (id) do nothing;

insert into brands (id, name) values
  ('br-1','DairyDirect Classic'),('br-2','Pasture Fresh'),('br-3','Village Craft')
on conflict (id) do nothing;

-- Plans are NOT part of the new spec (subscriptions are configuration-only) — no marketing plan rows.

-- Delivery slots & subscription holidays (§10)
insert into delivery_slots (id, label, window) values
  ('slot-1','Early morning','06:00 – 08:00'),
  ('slot-2','Morning','08:00 – 10:00'),
  ('slot-3','Evening','18:00 – 20:00'),
  ('slot-4','Night','20:00 – 22:00')
on conflict (id) do nothing;

insert into subscription_holidays (date, name) values
  ('2026-01-26','Republic Day — no deliveries'),
  ('2026-03-04','Holi — no milk subscriptions'),
  ('2026-01-28','Baner Store maintenance')
on conflict (date) do nothing;

-- Saved support responses (§11)
insert into saved_responses (id, title, body) values
  ('sr-1','Refund initiated','Your refund has been initiated and will reflect in 3–5 working days depending on your bank.'),
  ('sr-2','Wrong item delivered','We are sorry about the mix-up. Please keep the item; our rider will collect it and the correct one will be delivered today.'),
  ('sr-3','Delivery slot change','Your delivery slot has been updated as requested. The new window applies from your next order.'),
  ('sr-4','Wallet credit note','The goodwill credit has been added to your wallet and can be used on your next order.'),
  ('sr-5','Password reset guide','Use "Forgot password" on the login screen. The reset link is valid for 30 minutes.')
on conflict (id) do nothing;

-- System settings (§14): feature flags + business rules + subscription settings
insert into system_settings (id, features, rules, subscription) values
  (1,
   '{"cod":true,"wallets":true,"subscriptions":true}'::jsonb,
   '{"deliveryFee":40,"freeDeliveryAbove":499,"minOrderValue":149,"maxOrdersPerSlotPerStore":120,"dispatchRadiusKm":6,"dispatchBatchSize":8,"codMaxOrderValue":5000,"walletMaxBalance":10000,"refundWindowDays":7,"riderRequiredDocs":["license","id_proof","bank_details"]}'::jsonb,
   '{"orderCutoffTime":"20:00","autoRetryFailed":true,"defaultSlotId":"slot-1"}'::jsonb)
on conflict (id) do update set features = excluded.features, rules = excluded.rules, subscription = excluded.subscription;
