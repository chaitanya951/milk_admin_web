import { useDB } from '../mock-db/db'

/** Feature flags (§14) — COD / wallets / subscriptions. Changes apply instantly app-wide. */
export function useFeatureFlags() {
  return useDB((s) => s.db.systemSettings.features)
}

export function useFeature(flag: 'cod' | 'wallets' | 'subscriptions'): boolean {
  return useDB((s) => s.db.systemSettings.features[flag])
}
