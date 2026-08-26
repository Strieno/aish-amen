import { useEffect, useState } from 'react';
import {
  Bot,
  Brain,
  Cloud,
  Database,
  Download,
  Eye,
  FlaskConical,
  Languages,
  LogOut,
  Moon,
  Palette,
  Plus,
  Save,
  Shield,
  Sun,
  TestTube,
  Trash2,
  UploadCloud,
  User,
} from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { useAppStore, type Accent, type ThemeMode } from '../lib/app-store';
import type { Assistant, AiModel, Provider } from '../lib/types';
import { Badge, Button, Card, Field, Modal, Select, Spinner, Toggle } from '../components/ui';
import { useAuth } from '../cloud/AuthProvider';
import { useCloudStore } from '../cloud/store';
import { inspectLegacySqlite, migrateLegacySqlite } from '../cloud/migration';

const SECTIONS = ['account', 'general', 'appearance', 'language', 'ai', 'privacy', 'data', 'backups', 'developer'];

export default function SettingsPage() {
  const t = useT();
  const [section, setSection] = useState('general');

  return (
    <div className="space-y-5">
      <h1 className="section-title">{t('settings.title')}</h1>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('settings.title')}>
        {SECTIONS.map((s) => (
          <button key={s} role="tab" aria-selected={section === s} onClick={() => setSection(s)} className={`chip cursor-pointer ${section === s ? 'bg-brand text-white' : ''}`}>
            {s === 'account' ? 'الحساب والمزامنة' : t(`settings.${s}`)}
          </button>
        ))}
      </div>

      {section === 'account' && <AccountTab />}
      {section === 'general' && <GeneralTab />}
      {section === 'appearance' && <AppearanceTab />}
      {section === 'language' && <LanguageTab />}
      {section === 'ai' && <AiTab />}
      {section === 'privacy' && <PrivacyTab />}
      {section === 'data' && <DataTab />}
      {section === 'backups' && <BackupsTab />}
      {section === 'developer' && <DeveloperTab />}
    </div>
  );
}

function AccountTab() {
  const { cloudEnabled, user, signOut } = useAuth();
  const status = useCloudStore((state) => state.status);
  const pending = useCloudStore((state) => state.pending);
  const lastSyncedAt = useCloudStore((state) => state.lastSyncedAt);
  const message = useCloudStore((state) => state.message);
  const labels: Record<string, string> = {
    local: 'محلي على هذا الجهاز', connecting: 'جارٍ الاتصال', syncing: 'جارٍ المزامنة', synced: 'متزامن', offline: 'دون اتصال', error: 'تحتاج المزامنة إلى انتباه',
  };

  return (
    <SectionCard title="الحساب والمزامنة" icon={Cloud}>
      {!cloudEnabled ? (
        <div className="rounded-2xl bg-elevated p-4">
          <p className="font-bold text-ink">الوضع المحلي مفعّل</p>
          <p className="mt-1 text-sm text-ink-faint">أضف متغيرات Supabase لتفعيل الحساب والمزامنة، وسيبقى هذا الوضع متاحًا دون تغيير بياناتك.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-elevated p-4">
            <div className={`h-3 w-3 rounded-full ${status === 'synced' ? 'bg-brand-accent' : status === 'offline' ? 'bg-warn' : status === 'error' ? 'bg-danger' : 'animate-pulse bg-brand'}`} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold text-ink" dir="ltr">{user?.email}</p>
              <p className="text-xs text-ink-faint">{labels[status]}{pending ? ` — ${pending} بانتظار الإرسال` : ''}</p>
            </div>
            <Button variant="ghost" onClick={() => signOut()}><LogOut className="h-4 w-4" /> تسجيل الخروج</Button>
          </div>
          {lastSyncedAt && <p className="text-xs text-ink-faint">آخر مزامنة: {new Date(lastSyncedAt).toLocaleString('ar')}</p>}
          {message && <p className={`rounded-xl px-3 py-2 text-sm ${status === 'error' ? 'bg-danger-bg text-danger' : 'bg-brand-soft text-brand-dark'}`}>{message}</p>}
          <p className="text-sm leading-7 text-ink-soft">تُحفظ التغييرات الجديدة في حسابك. وإذا انقطع الإنترنت تبقى على هذا الجهاز ثم تُرسل تلقائيًا عند عودة الاتصال.</p>
        </div>
      )}
    </SectionCard>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2 text-brand-dark">
        <Icon className="h-4 w-4" />
        <h2 className="text-sm font-bold">{title}</h2>
      </div>
      {children}
    </Card>
  );
}

function GeneralTab() {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const [name, setName] = useState(settings.userName || '');
  const [simpleMode, setSimpleMode] = useState(settings.simpleMode !== 'false');

  return (
    <SectionCard title={t('settings.general')} icon={User}>
      <div className="space-y-3">
        <Field label={t('settings.userName')}>
          <div className="flex gap-2">
            <input className="input" aria-label={t('settings.userName')} value={name} onChange={(e) => setName(e.target.value)} />
            <Button onClick={() => update({ userName: name })} aria-label={t('common.save')} title={t('common.save')}><Save className="h-4 w-4" /></Button>
          </div>
        </Field>
        <Field label={t('settings.simpleMode')}>
          <div className="flex items-center gap-2">
            <Toggle checked={simpleMode} onChange={(v) => { setSimpleMode(v); update({ simpleMode: String(v) }); }} label={t('settings.simpleMode')} />
            <span className="text-sm text-ink-soft">{simpleMode ? t('settings.simpleMode') : t('settings.advancedMode')}</span>
          </div>
        </Field>
      </div>
    </SectionCard>
  );
}

function AppearanceTab() {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const setThemeMode = useAppStore((s) => s.setThemeMode);
  const setAccent = useAppStore((s) => s.setAccent);
  const mode = (settings.theme || 'dark') as ThemeMode;
  const accent = (settings.accent || 'green') as Accent;

  const modes: { key: ThemeMode; label: string; icon: React.ElementType }[] = [
    { key: 'light', label: t('settings.themeLight'), icon: Sun },
    { key: 'dark', label: t('settings.themeDark'), icon: Moon },
    { key: 'system', label: t('settings.themeSystem'), icon: Palette },
  ];

  return (
    <SectionCard title={t('settings.appearance')} icon={Palette}>
      <div className="space-y-4">
        <div>
          <p className="label">{t('settings.theme')}</p>
          <div className="flex gap-2">
            {modes.map((m) => (
              <Button key={m.key} variant={mode === m.key ? 'primary' : 'ghost'} onClick={() => setThemeMode(m.key)}>
                <m.icon className="h-4 w-4" /> {m.label}
              </Button>
            ))}
          </div>
        </div>
        <div>
          <p className="label">{t('settings.accent')}</p>
          <div className="flex gap-2">
            {(['green', 'midnight', 'warm', 'contrast'] as Accent[]).map((a) => (
              <button
                key={a}
                onClick={() => setAccent(a)}
                className={`h-10 w-10 rounded-full border-2 transition ${accent === a ? 'border-brand scale-110' : 'border-line'}`}
                style={{ background: a === 'green' ? '#2E7D32' : a === 'midnight' ? '#1A5C8C' : a === 'warm' ? '#9C5E2A' : '#111' }}
                aria-label={a}
              />
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function LanguageTab() {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  return (
    <SectionCard title={t('settings.language')} icon={Languages}>
      <div className="flex gap-2">
        <Button variant={lang === 'ar' ? 'primary' : 'ghost'} onClick={() => setLanguage('ar')}>العربية</Button>
        <Button variant={lang === 'en' ? 'primary' : 'ghost'} onClick={() => setLanguage('en')}>English</Button>
      </div>
      <p className="mt-3 text-sm text-ink-faint">RTL / LTR يتم ضبطه تلقائيًا مع تغيير اللغة.</p>
    </SectionCard>
  );
}

function AiTab() {
  const t = useT();
  const { data: providers, refetch: refetchProviders } = useApi<Provider[]>('/providers');
  const { data: models } = useApi<AiModel[]>('/models');
  const { data: assistants } = useApi<Assistant[]>('/assistants');
  const { data: status, refetch: refetchStatus } = useApi<{ providers: { id: string; status: string; modelCount: number }[] }>('/ai/status');
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);

  const [showAdd, setShowAdd] = useState(false);
  const [pType, setPType] = useState('ollama');
  const [pName, setPName] = useState('');
  const [pUrl, setPUrl] = useState('');
  const [pKey, setPKey] = useState('');
  const [pEmbed, setPEmbed] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok?: boolean; message?: string }>>({});

  const addProvider = async () => {
    await api.post('/providers', { type: pType, name: pName || pType, base_url: pUrl || null, api_key: pKey || null, embedding_model: pEmbed || null });
    setShowAdd(false);
    setPName(''); setPUrl(''); setPKey(''); setPEmbed('');
    refetchProviders();
    refetchStatus();
  };

  const test = async (id: string) => {
    setTesting(id);
    const r = await api.post<{ ok: boolean; message?: string; modelCount?: number; models?: AiModel[] }>(`/providers/${id}/test`);
    setTestResult({ [id]: r });
    setTesting(null);
    refetchStatus();
    refetchProviders();
  };

  const setPrimary = async (id: string) => {
    await api.post('/providers/primary', { id });
    refetchStatus();
  };

  const setDefaultModel = async (model: string) => {
    const ai = { ...(settings.ai || {}), defaultModel: model };
    await update({ ai });
  };

  const defaultModel = settings.ai?.defaultModel || '';

  const perms = () =>
    (settings.ai as { permissions?: { read?: Record<string, boolean>; write?: Record<string, boolean> } }).permissions || {
      read: {} as Record<string, boolean>,
      write: {} as Record<string, boolean>,
    };
  const setPerm = (kind: 'read' | 'write', key: string, v: boolean) => {
    const p = perms();
    update({
      ai: {
        ...(settings.ai || {}),
        permissions: { ...p, [kind]: { ...p[kind], [key]: v } },
      },
    });
  };

  return (
    <div className="space-y-4">
      <SectionCard title={t('settings.aiStatus')} icon={Bot}>
        <div className="space-y-2">
          {(providers || []).map((p) => {
            const st = status?.providers.find((x) => x.id === p.id)?.status || 'disconnected';
            return (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-elevated px-3 py-2">
                <span className={`h-2.5 w-2.5 rounded-full ${st === 'connected' ? 'bg-brand-accent' : st === 'error' ? 'bg-danger' : 'bg-ink-faint'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-ink">{p.name}</p>
                  <p className="truncate text-xs text-ink-faint" dir="ltr">{p.base_url || '—'}</p>
                </div>
                {p.is_primary && <Badge tone="brand">{t('settings.primary')}</Badge>}
                <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => test(p.id)} disabled={testing === p.id}>
                  {testing === p.id ? <Spinner className="h-3.5 w-3.5" /> : <TestTube className="h-3.5 w-3.5" />} {t('settings.test')}
                </Button>
                <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => setPrimary(p.id)}>
                  {t('settings.primary')}
                </Button>
                <Button
                  variant="ghost"
                  className="!px-3 !py-1.5 text-xs"
                  onClick={async () => { await api.del(`/providers/${p.id}`); refetchProviders(); refetchStatus(); }}
                  aria-label={`${t('common.delete')}: ${p.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
          {testResult && Object.entries(testResult).map(([k, v]) => (
            <div key={k} className={`rounded-xl px-3 py-2 text-sm ${v.ok ? 'bg-ok-bg text-ok' : 'bg-danger-bg text-danger'}`}>
              {v.message || (v.ok ? '✓' : '✕')}
            </div>
          ))}
          <Button variant="ghost" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" /> {t('settings.addConnection')}</Button>
        </div>
      </SectionCard>

      <SectionCard title={t('settings.models')} icon={FlaskConical}>
        <Field label={t('settings.defaultModel')}>
          <Select value={defaultModel} onChange={setDefaultModel}>
            <option value="">{t('common.none')}</option>
            {(models || []).map((m) => (
              <option key={m.id} value={m.model_id}>{m.display_name || m.model_id}</option>
            ))}
          </Select>
        </Field>
        <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
          {(models || []).map((m) => (
            <span key={m.id} className="chip">{m.model_id}</span>
          ))}
          {(models || []).length === 0 && <p className="text-sm text-ink-faint">—</p>}
        </div>
      </SectionCard>

      <SectionCard title={t('settings.assistants')} icon={Brain}>
        <div className="space-y-1.5">
          {(assistants || []).map((a) => (
            <div key={a.id} className="flex items-center gap-2 rounded-xl bg-elevated px-3 py-2">
              <Bot className="h-4 w-4 shrink-0 text-brand-dark" />
              <span className="flex-1 text-sm font-semibold text-ink">{a.name}</span>
              {a.is_default && <Badge tone="brand">{t('settings.primary')}</Badge>}
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t('settings.aiPerms')} icon={Shield}>
        <p className="mb-2 text-xs font-bold text-ink-faint">{t('settings.readPerms')}</p>
        <div className="mb-4 grid grid-cols-2 gap-2">
          {[
            ['journal', 'settings.permJournal'],
            ['tasks', 'settings.permTasks'],
            ['study', 'settings.permStudy'],
            ['work', 'settings.permWork'],
            ['memories', 'settings.permMemories'],
            ['checkins', 'settings.permCheckins'],
            ['safe', 'settings.permSafe'],
          ].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-lg bg-elevated px-3 py-2">
              <span className="text-sm text-ink-soft">{t(label)}</span>
              <Toggle
                checked={(perms().read as Record<string, boolean>)[key] !== false}
                onChange={(v) => setPerm('read', key, v)}
                label={t(label)}
              />
            </div>
          ))}
        </div>
        <p className="mb-2 text-xs font-bold text-ink-faint">{t('settings.writePerms')}</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['tasks', 'settings.permWriteTasks'],
            ['memories', 'settings.permWriteMemories'],
            ['journal', 'settings.permWriteJournal'],
            ['goals', 'settings.permWriteGoals'],
            ['work_notes', 'settings.permWriteWork'],
            ['study', 'settings.permWriteStudy'],
          ].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-lg bg-elevated px-3 py-2">
              <span className="text-sm text-ink-soft">{t(label)}</span>
              <Toggle
                checked={(perms().write as Record<string, boolean>)[key] !== false}
                onChange={(v) => setPerm('write', key, v)}
                label={t(label)}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between rounded-lg bg-elevated px-3 py-2">
          <span className="text-sm text-ink-soft">{t('chat.autoActions')}</span>
          <Toggle
            checked={(settings.ai as Record<string, unknown>).autoActions !== false}
            onChange={(v) => update({ ai: { ...(settings.ai || {}), autoActions: v } })}
            label={t('chat.autoActions')}
          />
        </div>
      </SectionCard>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title={t('settings.addConnection')}>
        <div className="space-y-3">
          <Field label={t('settings.providerType')}>
            <Select value={pType} onChange={setPType}>
              <option value="ollama">Ollama</option>
              <option value="openai-compatible">OpenAI-compatible</option>
            </Select>
          </Field>
          <Field label={t('common.name')}><input className="input" value={pName} onChange={(e) => setPName(e.target.value)} /></Field>
          <Field label={t('settings.serverUrl')}><input className="input" dir="ltr" value={pUrl} onChange={(e) => setPUrl(e.target.value)} placeholder="http://localhost:11434" /></Field>
          <Field label={t('settings.apiKey')} hint={t('settings.maxPrivacyHint')}><input className="input" dir="ltr" type="password" value={pKey} onChange={(e) => setPKey(e.target.value)} /></Field>
          <Field label={t('settings.embeddingModel')}><input className="input" dir="ltr" value={pEmbed} onChange={(e) => setPEmbed(e.target.value)} placeholder="nomic-embed-text" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>{t('common.cancel')}</Button>
            <Button onClick={addProvider}>{t('common.add')}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PrivacyTab() {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSettings);
  const privacy = settings.privacy || { maxPrivacy: false, blockCloud: false, analytics: false };

  return (
    <SectionCard title={t('settings.privacy')} icon={Shield}>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl bg-elevated p-3">
          <div>
            <p className="text-sm font-bold text-ink">{t('settings.maxPrivacy')}</p>
            <p className="text-xs text-ink-faint">{t('settings.maxPrivacyHint')}</p>
          </div>
          <Toggle checked={privacy.maxPrivacy} onChange={(v) => update({ privacy: { ...privacy, maxPrivacy: v } })} label={t('settings.maxPrivacy')} />
        </div>
        {privacy.maxPrivacy && (
          <div className="rounded-xl bg-brand-soft p-3 text-sm font-bold text-brand-dark">🔒 {t('settings.localOnly')}</div>
        )}
        <div className="flex items-center justify-between rounded-xl bg-elevated p-3">
          <p className="text-sm font-bold text-ink">{t('settings.analytics')}</p>
          <Toggle checked={privacy.analytics} onChange={(v) => update({ privacy: { ...privacy, analytics: v } })} label={t('settings.analytics')} />
        </div>
      </div>
    </SectionCard>
  );
}

function DataTab() {
  const t = useT();
  const { cloudEnabled, user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState('');

  const doExport = async () => {
    setExporting(true);
    try {
      const data = await api.get<unknown>('/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `aish-aman-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const migrateLocal = async () => {
    if (!user) return;
    setMigrationMessage('جارٍ فحص البيانات المحلية…');
    const preview = await inspectLegacySqlite();
    if (!preview.available) {
      setMigrationMessage('لم أعثر على قاعدة محلية تعمل على هذا الجهاز. شغّل النسخة المحلية أولًا ثم أعد المحاولة.');
      return;
    }
    const sensitive = ['journal_entries', 'memories', 'conversations', 'messages', 'documents'];
    const sensitiveCount = sensitive.reduce((sum, table) => sum + Number(preview.counts[table] || 0), 0);
    const accepted = window.confirm(
      `سيتم رفع ${preview.total} سجلًا من قاعدة SQLite المحلية إلى حساب Supabase الحالي، منها ${sensitiveCount} سجلًا قد يشمل اليوميات والذاكرة والمحادثات وبيانات المستندات.\n\nلن تُحذف أو تُعدّل قاعدة SQLite، وستُحفظ نسخة محلية قبل الرفع. هل تريد المتابعة؟`,
    );
    if (!accepted) {
      setMigrationMessage('تم إلغاء النقل، ولم تُرفع أي بيانات.');
      return;
    }
    setMigrating(true);
    setMigrationMessage('جارٍ نقل البيانات والتحقق منها…');
    const result = await migrateLegacySqlite(user.id);
    setMigrating(false);
    if (result.error) setMigrationMessage(`تعذر إكمال النقل: ${result.error}`);
    else if (result.alreadyMigrated) setMigrationMessage('هذه النسخة نُقلت سابقًا؛ لم تُنشأ أي سجلات مكررة.');
    else setMigrationMessage(`اكتمل النقل: ${result.imported} سجلًا. قاعدة SQLite ما زالت محفوظة على جهازك.`);
  };

  return (
    <SectionCard title={t('settings.data')} icon={Database}>
      <div className="flex flex-wrap gap-2">
        <Button onClick={doExport} disabled={exporting}>
          {exporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />} {t('common.export')}
        </Button>
        {cloudEnabled && user && (
          <Button variant="ghost" onClick={migrateLocal} disabled={migrating}>
            {migrating ? <Spinner className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />} نقل بيانات SQLite المحلية
          </Button>
        )}
      </div>
      <p className="mt-3 text-sm text-ink-faint">يمكنك تنزيل نسخة JSON كاملة في أي وقت. نقل SQLite اختياري ولا يحذف الأصل.</p>
      {migrationMessage && <p className="mt-3 rounded-xl bg-elevated px-3 py-2 text-sm text-ink-soft" role="status">{migrationMessage}</p>}
    </SectionCard>
  );
}

function BackupsTab() {
  const t = useT();
  const { data: backups, loading, refetch } = useApi<{ id: string; createdAt: string; sizeBytes: number }[]>('/backups');
  const [creating, setCreating] = useState(false);

  const create = async () => {
    setCreating(true);
    await api.post('/backups');
    setCreating(false);
    refetch();
  };

  const restore = async (id: string) => {
    if (window.confirm(`Restore ${id}? Current data will be replaced.`)) {
      await api.post(`/backups/${id}/restore`);
      window.location.reload();
    }
  };

  return (
    <SectionCard title={t('settings.backups')} icon={Download}>
      <Button onClick={create} disabled={creating}>
        {creating ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />} {t('settings.createBackup')}
      </Button>
      <div className="mt-3 space-y-2">
        {loading ? <Spinner className="h-5 w-5" /> : null}
        {(backups || []).length === 0 && !loading ? (
          <p className="text-sm text-ink-faint">{t('settings.noBackups')}</p>
        ) : (
          (backups || []).map((b) => (
            <div key={b.id} className="flex items-center gap-3 rounded-xl bg-elevated px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" dir="ltr">{b.id}</span>
              <span className="text-xs text-ink-faint">{new Date(b.createdAt).toLocaleString()}</span>
              <span className="text-xs text-ink-faint">{(b.sizeBytes / 1024).toFixed(0)} KB</span>
              <Button variant="ghost" className="!px-3 !py-1.5 text-xs" onClick={() => restore(b.id)}>
                {t('settings.restore')}
              </Button>
              <Button
                variant="ghost"
                className="!px-3 !py-1.5 text-xs"
                onClick={async () => { await api.del(`/backups/${b.id}`); refetch(); }}
                aria-label={`${t('common.delete')}: ${b.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}

function DeveloperTab() {
  const t = useT();
  const { data: events, refetch } = useApi<{ id: number; level: string; category: string; message: string; created_at: string }[]>('/events?limit=30');
  useEffect(() => {
    const id = window.setInterval(() => refetch(), 10000);
    return () => window.clearInterval(id);
  }, [refetch]);

  return (
    <SectionCard title={t('settings.events')} icon={Eye}>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {(events || []).length === 0 ? (
          <p className="text-sm text-ink-faint">{t('common.noData')}</p>
        ) : (
          (events || []).map((e) => (
            <div key={e.id} className="flex items-start gap-2 rounded-lg bg-elevated px-2.5 py-1.5 text-xs">
              <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${e.level === 'error' ? 'bg-danger' : 'bg-brand-accent'}`} />
              <span className="text-ink-faint" dir="ltr">{e.created_at.slice(11, 19)}</span>
              <span className="text-ink-soft">[{e.category}] {e.message}</span>
            </div>
          ))
        )}
      </div>
    </SectionCard>
  );
}
