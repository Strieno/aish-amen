import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
export const supabasePublishableKey = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const publishableKey = supabasePublishableKey;

export const cloudConfigured = Boolean(supabaseUrl && publishableKey);

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'aishaman.auth',
      },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

export const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

