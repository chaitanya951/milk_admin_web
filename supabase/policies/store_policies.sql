-- ════════════════════════════════════════════════════════════════════
-- DairyDirect — policies/store_policies.sql
-- RLS for the store-web domain: store managers only touch rows of their
-- assigned store_ids (store_managers mapping); admins pass is_admin().
-- ════════════════════════════════════════════════════════════════════

-- ── Store-portal RLS: managers only touch rows of their assigned stores ──
create or replace function is_assigned_store_manager(check_store text) returns boolean language sql stable as $$
  select exists (
    select 1 from store_managers sm
    join workforce w on w.id = sm.workforce_id
    where w.email = auth.jwt() ->> 'email' and w.role = 'store_manager'
      and w.status = 'active' and sm.store_id = check_store
  );
$$;

do $$ declare t text; begin
  foreach t in array array['picking_tasks','task_assignments','pick_lines','substitutions','packing_details',
    'handovers','returns','return_items','quality_decisions','inventory_batches','stock_receipts',
    'stock_counts','stock_adjustments','rider_applications','rider_documents','cod_deposits',
    'store_status_changes','notifications']
  loop
    execute format('drop policy if exists "store_scoped" on %I', t);
    execute format($f$create policy "store_scoped" on %I for all to authenticated
      using (is_assigned_store_manager(store_id::text) or is_admin())
      with check (is_assigned_store_manager(store_id::text) or is_admin())$f$, t);
  end loop;
end $$;

create policy "mgr_read_own_prefs" on notification_preferences for all to authenticated
  using (workforce_id in (select id from workforce w where w.email = auth.jwt() ->> 'email'))
  with check (workforce_id in (select id from workforce w where w.email = auth.jwt() ->> 'email'));
create policy "mgr_read_store_managers" on store_managers for select to authenticated using (true);
create policy "admin_write_store_managers" on store_managers for all to authenticated using (is_admin()) with check (is_admin());
create policy "mgr_read_bins" on bin_locations for select to authenticated using (is_assigned_store_manager(store_id::text) or is_admin());
create policy "admin_write_bins" on bin_locations for all to authenticated using (is_admin()) with check (is_admin());
