import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// The app runs on the built-in mock data layer by default.
// Set VITE_USE_SUPABASE=true + URL/ANON_KEY to talk to Supabase instead
// (schema in /supabase/schema.sql, policies + seed included).
const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const ENABLED = import.meta.env.VITE_USE_SUPABASE === 'true' && !!URL && !!ANON

export const isSupabaseEnabled = ENABLED
export const supabase: SupabaseClient | null = ENABLED ? createClient(URL!, ANON!) : null
