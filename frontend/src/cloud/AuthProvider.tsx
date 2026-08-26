import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { cacheRows, removeCachedRow } from './cache';
import { cloudConfigured, requireSupabase } from './client';
import { flushOfflineQueue } from './repository';
import { useCloudStore } from './store';
import AuthPage from './AuthPage';
import { liveBus } from '../lib/live';

interface AuthValue {
  cloudEnabled: boolean;
  user: User | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>({ cloudEnabled: false, user: null, signOut: async () => {} });
const REALTIME_TABLES = ['tasks', 'memories', 'goals', 'journal_entries', 'checkins'] as const;
const ENTITY_TYPES: Record<string, string> = { tasks: 'task', memories: 'memory', goals: 'goal', journal_entries: 'journal', checkins: 'checkin' };

export function useAuth() {
  return useContext(AuthContext);
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!cloudConfigured);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    if (!cloudConfigured) {
      useCloudStore.getState().setStatus('local');
      return;
    }
    let alive = true;
    requireSupabase().auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setReady(true);
    });
    const { data: listener } = requireSupabase().auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      setReady(true);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') useCloudStore.getState().setStatus('connecting');
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    useCloudStore.getState().setStatus(navigator.onLine ? 'connecting' : 'offline');
    void flushOfflineQueue(userId);
  }, [session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    const onOnline = () => void flushOfflineQueue(userId);
    const onOffline = () => useCloudStore.getState().setStatus('offline', 'أنت دون اتصال؛ التغييرات محفوظة على هذا الجهاز');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    const channel = requireSupabase().channel(`aishaman:${userId}`);
    for (const table of REALTIME_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` }, (payload) => {
        const current = payload.new as Record<string, unknown>;
        const previous = payload.old as Record<string, unknown>;
        const id = String(current?.id || previous?.id || '');
        if (payload.eventType === 'DELETE') void removeCachedRow(userId, table, id);
        else if (current && id) void cacheRows(userId, table, [current]);
        liveBus.emitCloud(ENTITY_TYPES[table], id);
        useCloudStore.getState().markSynced();
      });
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') useCloudStore.getState().setStatus('synced');
      if (status === 'CHANNEL_ERROR') useCloudStore.getState().setStatus('error', 'تعذر الاتصال بالمزامنة المباشرة');
    });

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      void requireSupabase().removeChannel(channel);
    };
  }, [session?.user.id]);

  const value = useMemo<AuthValue>(() => ({
    cloudEnabled: cloudConfigured,
    user: session?.user || null,
    signOut: async () => {
      const { error } = await requireSupabase().auth.signOut();
      if (error) throw error;
    },
  }), [session?.user]);

  if (!ready) return <div className="flex min-h-dvh items-center justify-center bg-canvas"><span className="h-9 w-9 animate-spin rounded-full border-4 border-brand-soft border-t-brand" /></div>;
  if (cloudConfigured && recovery) return <AuthPage recovery onRecoveryDone={() => setRecovery(false)} />;
  if (cloudConfigured && !session) return <AuthPage />;
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

