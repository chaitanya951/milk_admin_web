-- ════════════════════════════════════════════════════════════════════
-- DairyDirect — seed/store.sql
-- Store-web demo account + store assignments. Run AFTER seed/shared.sql.
-- Credentials live in Supabase Auth (auth.users); the store_managers
-- mapping drives policies/store_policies.sql (is_assigned_store_manager).
-- In mock mode the same account is seeded by packages/shared/src/mock-db
-- (password Store@123, only shown when VITE_DEMO_MODE=true) and manages
-- two stores, so the store selector appears after sign-in.
-- ════════════════════════════════════════════════════════════════════

insert into workforce (id, name, email, phone, role, status, avatar) values
  ('wf-demo-manager', 'Chaitanya Raju', 'chaitanya.raju@srm.edu.in', '+91 90000 00002', 'store_manager', 'active', 2)
on conflict (id) do nothing;

-- Assigned stores (two → the store selector shows in the top bar).
insert into store_managers (id, workforce_id, store_id) values
  ('sm-demo-1', 'wf-demo-manager', 'st-1'),
  ('sm-demo-2', 'wf-demo-manager', 'st-3')
on conflict (id) do nothing;
