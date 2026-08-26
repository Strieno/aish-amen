import { create } from 'zustand';

export interface ActiveSound {
  id: string;
  url: string;
  el: HTMLAudioElement;
  volume: number;
  loop: boolean;
  title: string;
}

interface PlayerState {
  active: Record<string, ActiveSound>;
  master: number;
  play: (params: { id: string; url: string; title?: string; volume?: number; loop?: boolean }) => void;
  stop: (id: string) => void;
  stopAll: () => void;
  setVolume: (id: string, volume: number) => void;
  setLoop: (id: string, loop: boolean) => void;
  setMaster: (volume: number) => void;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  active: {},
  master: 0.8,

  play: ({ id, url, title = '', volume = 0.8, loop = true }) => {
    const prev = get().active[id];
    if (prev) {
      prev.el.pause();
      prev.el.src = '';
    }
    const el = new Audio(url);
    el.loop = loop;
    el.volume = volume * get().master;
    el.play().catch(() => {});
    set((s) => ({ active: { ...s.active, [id]: { id, url, el, volume, loop, title } } }));
  },

  stop: (id) => {
    const s = get().active[id];
    if (s) {
      s.el.pause();
      s.el.src = '';
    }
    set((st) => {
      const next = { ...st.active };
      delete next[id];
      return { active: next };
    });
  },

  stopAll: () => {
    for (const s of Object.values(get().active)) {
      s.el.pause();
      s.el.src = '';
    }
    set({ active: {} });
  },

  setVolume: (id, volume) => {
    set((s) => {
      const snd = s.active[id];
      if (snd) snd.el.volume = volume * s.master;
      return { active: { ...s.active, [id]: snd ? { ...snd, volume } : s.active[id] } };
    });
  },

  setLoop: (id, loop) => {
    set((s) => {
      const snd = s.active[id];
      if (snd) snd.el.loop = loop;
      return { active: { ...s.active, [id]: snd ? { ...snd, loop } : s.active[id] } };
    });
  },

  setMaster: (master) => {
    for (const s of Object.values(get().active)) s.el.volume = s.volume * master;
    set({ master });
  },
}));
