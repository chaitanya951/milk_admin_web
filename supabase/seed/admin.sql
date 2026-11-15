-- ════════════════════════════════════════════════════════════════════
-- DairyDirect — seed/admin.sql
-- Admin-web demo account. Run AFTER seed/shared.sql.
-- Credentials live in Supabase Auth (auth.users) — the workforce row
-- carries the role used by policies/admin_policies.sql (is_admin()).
-- In mock mode the same account is seeded by packages/shared/src/mock-db
-- (password Admin@123, only shown when VITE_DEMO_MODE=true).
-- ════════════════════════════════════════════════════════════════════

insert into workforce (id, name, email, phone, role, status, avatar) values
  ('wf-demo-admin', 'DairyDirect Admin', 'admin@dairydirect.in', '+91 90000 00001', 'admin', 'active', 1)
on conflict (id) do nothing;
