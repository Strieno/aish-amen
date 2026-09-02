import { create } from 'zustand';
import { api } from './api';
import { useI18nStore } from './i18n';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Accent = 'green' | 'midnight' | 'warm' | 'contrast';

export interface AudioSettings {
  uiSounds: boolean;
  ttsEnabled: boolean;
  autoSpeakReplies: boolean;
  speechRate: number;
  voiceLang: string;
  ttsEngine: string;
  ttsProviderId: string;
  ttsModel: string;
  ttsVoice: string;
  ttsVoiceEdge: string;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  uiSounds: true,
  ttsEnabled: true,
  autoSpeakReplies: true,
  speechRate: 1,
  voiceLang: 'auto',
  ttsEngine: 'server',
  ttsProviderId: '',
  ttsModel: 'tts-1',
  ttsVoice: 'alloy',
  ttsVoiceEdge: 'auto',
};

export function normalizeAudioSettings(value: unknown): AudioSettings {
  const raw = value && typeof value === 'object' ? value as Partial<AudioSettings> : {};
  const speechRate = Number(raw.speechRate);
  const legacyVoiceDefaults = (!raw.ttsVoice || raw.ttsVoice === 'auto')
    && (!raw.ttsModel || raw.ttsModel === 'gpt-4o-mini-tts');
  return {
    ...DEFAULT_AUDIO_SETTINGS,
    ...raw,
    uiSounds: raw.uiSounds !== false,
    ttsEnabled: raw.ttsEnabled !== false,
    autoSpeakReplies: raw.autoSpeakReplies !== false,
    speechRate: Number.isFinite(speechRate) ? Math.min(1.8, Math.max(0.6, speechRate)) : DEFAULT_AUDIO_SETTINGS.speechRate,
    voiceLang: typeof raw.voiceLang === 'string' ? raw.voiceLang : DEFAULT_AUDIO_SETTINGS.voiceLang,
    ttsEngine: legacyVoiceDefaults && raw.ttsEngine === 'auto'
      ? DEFAULT_AUDIO_SETTINGS.ttsEngine
      : typeof raw.ttsEngine === 'string' ? raw.ttsEngine : DEFAULT_AUDIO_SETTINGS.ttsEngine,
    ttsProviderId: typeof raw.ttsProviderId === 'string' ? raw.ttsProviderId : DEFAULT_AUDIO_SETTINGS.ttsProviderId,
    ttsModel: !raw.ttsModel || raw.ttsModel === 'gpt-4o-mini-tts' ? DEFAULT_AUDIO_SETTINGS.ttsModel : raw.ttsModel,
    ttsVoice: !raw.ttsVoice || raw.ttsVoice === 'auto' ? DEFAULT_AUDIO_SETTINGS.ttsVoice : raw.ttsVoice,
    ttsVoiceEdge: typeof raw.ttsVoiceEdge === 'string' ? raw.ttsVoiceEdge : DEFAULT_AUDIO_SETTINGS.ttsVoiceEdge,
  };
}

interface Settings {
  language: string;
  theme: string;
  accent: string;
  userName: string;
  ai: {
    defaultModel?: string | null;
    fallbackProvider?: string | null;
    autoMemory?: boolean;
    autoActions?: boolean;
    permissions?: {
      read?: Record<string, boolean>;
      write?: Record<string, boolean>;
    };
    contextBudget?: Record<string, number>;
    modelParams?: Record<string, unknown>;
  };
  privacy: { maxPrivacy: boolean; blockCloud: boolean; analytics: boolean };
  audio: AudioSettings;
  simpleMode: string;
  quietHours?: { enabled: boolean; start: string; end: string; sound: boolean; spoken: boolean; visual: boolean };
  sidebarVisible: string[];
  [key: string]: unknown;
}

interface AppState {
  ready: boolean;
  settings: Settings;
  sidebarVisible: string[];
  /** Desktop sidebar collapsed to an icon rail (UI-only, not synced). */
  sidebarCollapsed: boolean;
  loadSettings: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  setLanguage: (lang: string) => Promise<void>;
  setThemeMode: (mode: ThemeMode) => void;
  setAccent: (accent: Accent) => void;
  toggleSidebarItem: (id: string) => void;
  toggleSidebarCollapsed: () => void;
}

const defaultSettings: Settings = {
  language: 'ar',
  theme: 'light',
  accent: 'green',
  userName: '',
  ai: {},
  privacy: { maxPrivacy: false, blockCloud: false, analytics: false },
  audio: DEFAULT_AUDIO_SETTINGS,
  simpleMode: 'true',
  sidebarVisible: ['today', 'chat', 'safe', 'tasks', 'study', 'work', 'journal', 'goals', 'gratitude', 'memory', 'knowledge', 'audio', 'focus', 'insights', 'settings'],
};

export function resolveThemeMode(): 'light' | 'dark' {
  const stored = localStorage.getItem('aish.theme') as ThemeMode | null;
  const mode = stored || 'light';
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode === 'dark' ? 'dark' : 'light';
}

export function applyTheme(mode: ThemeMode, accent: Accent) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolveThemeMode() === 'dark');
  root.classList.remove('theme-green', 'theme-midnight', 'theme-warm', 'theme-contrast');
  root.classList.add(`theme-${accent}`);
  localStorage.setItem('aish.theme', mode);
  localStorage.setItem('aish.accent', accent);
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  settings: defaultSettings,
  sidebarVisible: defaultSettings.sidebarVisible,
  sidebarCollapsed: false,

  loadSettings: async () => {
    try {
      const s = (await api.get<Settings>('/settings')) || {};
      const merged: Settings = { ...defaultSettings, ...s, audio: normalizeAudioSettings(s.audio) };
      set({ settings: merged, sidebarVisible: merged.sidebarVisible || defaultSettings.sidebarVisible });
      useI18nStore.getState().setLang(merged.language === 'en' ? 'en' : 'ar');
      document.documentElement.lang = merged.language === 'en' ? 'en' : 'ar';
      document.documentElement.dir = merged.language === 'en' ? 'ltr' : 'rtl';
      applyTheme((merged.theme as ThemeMode) || 'light', (merged.accent as Accent) || 'green');
    } catch {
      set({ settings: defaultSettings });
      applyTheme('light', 'green');
    } finally {
      set({ ready: true });
    }
  },

  updateSettings: async (patch) => {
    const next = {
      ...get().settings,
      ...patch,
      audio: patch.audio ? normalizeAudioSettings({ ...get().settings.audio, ...patch.audio }) : get().settings.audio,
    };
    set({ settings: next });
    try {
      await api.put('/settings', patch);
    } catch { /* local-only mode still works */ }
  },

  setLanguage: async (lang) => {
    useI18nStore.getState().setLang(lang as 'ar' | 'en');
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
    await get().updateSettings({ language: lang });
  },

  setThemeMode: (mode) => {
    const accent = get().settings.accent as Accent;
    applyTheme(mode, accent);
    get().updateSettings({ theme: mode });
  },

  setAccent: (accent) => {
    const mode = get().settings.theme as ThemeMode;
    applyTheme(mode, accent);
    get().updateSettings({ accent });
  },

  toggleSidebarItem: (id) => {
    const list = get().sidebarVisible;
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    set({ sidebarVisible: next });
    get().updateSettings({ sidebarVisible: next });
  },

  toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
