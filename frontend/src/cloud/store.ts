import { create } from 'zustand';

export type SyncStatus = 'local' | 'connecting' | 'syncing' | 'synced' | 'offline' | 'error';

interface CloudState {
  status: SyncStatus;
  pending: number;
  lastSyncedAt: string | null;
  message: string | null;
  setStatus: (status: SyncStatus, message?: string | null) => void;
  setPending: (pending: number) => void;
  markSynced: () => void;
}

export const useCloudStore = create<CloudState>((set) => ({
  status: 'local',
  pending: 0,
  lastSyncedAt: null,
  message: null,
  setStatus: (status, message = null) => set({ status, message }),
  setPending: (pending) => set({ pending }),
  markSynced: () => set({ status: 'synced', pending: 0, lastSyncedAt: new Date().toISOString(), message: null }),
}));

