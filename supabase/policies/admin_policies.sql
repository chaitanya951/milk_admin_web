-- ════════════════════════════════════════════════════════════════════
-- DairyDirect — policies/admin_policies.sql
-- RLS for the admin-web domain: admins read everything; staff read
-- operational data; only admins mutate master data.
-- ════════════════════════════════════════════════════════════════════

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

