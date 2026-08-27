import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Copy,
  Eye,
  FolderPlus,
  FolderOpen,
  Folders,
  Import,
  Leaf,
  MessageSquare,
  MoreVertical,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Square,
  Tag,
  Trash2,
} from 'lucide-react';
import { api, streamChat } from '../lib/api';
import { useApi } from '../lib/useApi';
import { useT } from '../lib/i18n';
import { useAppStore } from '../lib/app-store';
import type { AiProposal, Assistant, AiModel, ChatMessage, CloudAiStatus, ContextItem, ContextUsed, Conversation, ConversationExport, Folder, SearchResults } from '../lib/types';
import Markdown from '../components/Markdown';
import { Badge, Button, EmptyState, Modal, Select, Spinner } from '../components/ui';
import EntityChip from '../components/EntityChip';
import AiActionCards from '../components/AiActionCards';
import VoiceInputButton from '../components/VoiceInputButton';
import SpeakButton from '../components/SpeakButton';
import { playNotify, playSend } from '../lib/sound';
import { stopSpeaking } from '../lib/speech';

function friendlyModelName(model: AiModel, lang: string): string {
  const explicit = model.display_name?.trim();
  if (explicit && explicit !== model.model_id && explicit.length <= 42) return explicit;

  const source = explicit || model.model_id;
  const familyMatch = source.match(/(command[-_ ]?r|qwen\s*\d+(?:\.\d+)?|lfm\s*\d+(?:\.\d+)?)/i);
  const sizeMatch = source.match(/(?:^|[-_: ])(\d+(?:\.\d+)?b)(?:$|[-_: ])/i);
  let family = familyMatch?.[1] || source.split('/').pop()?.split(':')[0] || source;
  family = family
    .replace(/command[-_ ]?r/i, 'Command R')
    .replace(/qwen\s*(\d)/i, 'Qwen $1')
    .replace(/lfm\s*(\d)/i, 'LFM $1')
    .replace(/[_-]+/g, ' ')
    .trim();

  const details = [family];
  if (sizeMatch?.[1] && !family.toLowerCase().includes(sizeMatch[1].toLowerCase())) details.push(sizeMatch[1].toUpperCase());
  if (/coder/i.test(source)) details.push(lang === 'en' ? 'Coding' : 'برمجة');
  if (/arabic/i.test(source)) details.push(lang === 'en' ? 'Arabic' : 'عربي');
  return details.join(' · ');
}

// Provider model catalogs may contain embedding, image, audio, moderation,
// realtime, and legacy completion models. Those cannot serve this chat UI.
function isChatModel(model: AiModel): boolean {
  if (/^(?:babbage|davinci|text-embedding|whisper|tts-|gpt-(?:audio|image|live|realtime|transcribe)|chatgpt-image|omni-moderation|sora-)/i.test(model.model_id)) return false;
  const capabilities = (model.capabilities || []).map((capability) => capability.toLowerCase());
  const embeddingOnly = capabilities.some((capability) => capability.includes('embedding'))
    && !capabilities.some((capability) => /chat|completion|stream|text/.test(capability));
  return !embeddingOnly;
}

export default function ChatPage() {
  const t = useT();
  const lang = useAppStore((s) => s.settings.language);
  const defaultModel = useAppStore((s) => s.settings.ai?.defaultModel || '');
  const [params] = useSearchParams();
  const convId = params.get('conv');

  const { data: assistants } = useApi<Assistant[]>('/assistants');
  const { data: models } = useApi<AiModel[]>('/models');
  const { data: folders, refetch: refetchFolders } = useApi<Folder[]>('/folders');
  const { data: aiStatus, refetch: refetchAiStatus } = useApi<CloudAiStatus>('/ai/status');

  const [conversationId, setConversationId] = useState<string | null>(convId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [sendError, setSendError] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');
  const [assistantId, setAssistantId] = useState<string>('');
  const [modelKey, setModelKey] = useState<string>('');
  const [inspector, setInspector] = useState<ContextUsed | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Categorization & organization state
  const [searchQ, setSearchQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showFoldersModal, setShowFoldersModal] = useState(false);
  const [showCategorize, setShowCategorize] = useState<Conversation | null>(null);
  const [categorizing, setCategorizing] = useState(false);
  const [categorySuggestion, setCategorySuggestion] = useState<{ folder: string | null; tags: string[] } | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [tagEditId, setTagEditId] = useState<string | null>(null);
  const [tagEditText, setTagEditText] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');

  // LifeOS: context mode, pinned context, chips, AI action proposals
  const [mode, setMode] = useState('general');
  const [contextModes, setContextModes] = useState<string[]>(['general']);
  const [pinnedCtx, setPinnedCtx] = useState<ContextItem[]>([]);
  const [lastUsedCtx, setLastUsedCtx] = useState<ContextItem[]>([]);
  const [proposals, setProposals] = useState<AiProposal[]>([]);
  const [proposing, setProposing] = useState(false);
  const [ctxPickerOpen, setCtxPickerOpen] = useState(false);
  const [ctxSearch, setCtxSearch] = useState('');
  const [ctxResults, setCtxResults] = useState<SearchResults | null>(null);

  useEffect(() => {
    api.get<string[]>('/ai/context-modes').then((m) => setContextModes(m)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setPinnedCtx([]);
      return;
    }
    api.get<ContextItem[]>(`/conversations/${conversationId}/context`).then(setPinnedCtx).catch(() => setPinnedCtx([]));
  }, [conversationId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(searchQ), 350);
    return () => window.clearTimeout(timer);
  }, [searchQ]);

  const convUrl = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedQ) p.set('q', debouncedQ);
    const qs = p.toString();
    return `/conversations${qs ? `?${qs}` : ''}`;
  }, [debouncedQ]);

  const { data: convs, refetch: refetchConvs } = useApi<Conversation[]>(convUrl, [debouncedQ]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const c of convs || []) for (const tg of c.tags || []) set.add(tg);
    return [...set].sort();
  }, [convs]);

  const visibleConvs = useMemo(() => {
    let list = convs || [];
    if (folderFilter) list = list.filter((c) => (c.folder || '') === folderFilter);
    if (tagFilter) list = list.filter((c) => (c.tags || []).includes(tagFilter));
    return list;
  }, [convs, folderFilter, tagFilter]);

  useEffect(() => {
    if (assistants?.length && !assistantId) {
      const def = assistants.find((a) => a.is_default) || assistants[0];
      setAssistantId(def.id);
    }
  }, [assistants, assistantId]);

  const readyProviderIds = useMemo(() => new Set(
    (aiStatus?.providers || [])
      .filter((provider) => provider.status === 'connected' || provider.status === 'configured')
      .map((provider) => provider.id),
  ), [aiStatus]);
  const chatModels = useMemo(() => {
    const candidates = (models || []).filter(isChatModel);
    if (!aiStatus?.providers?.length) return candidates;
    return candidates.filter((model) => readyProviderIds.has(model.provider_id));
  }, [aiStatus, models, readyProviderIds]);
  const selectedModel = useMemo(
    () => chatModels.find((item) => item.id === modelKey) || null,
    [chatModels, modelKey],
  );

  useEffect(() => {
    if (!chatModels.length || selectedModel) return;
    const preferred = chatModels.find((item) => item.model_id === defaultModel)
      || chatModels.find((item) => item.provider_id === 'prov-ollama')
      || chatModels[0];
    setModelKey(preferred.id);
  }, [chatModels, defaultModel, selectedModel]);

  useEffect(() => {
    if (!conversationId || !convs?.length || !chatModels.length) return;
    const conversation = convs.find((item) => item.id === conversationId);
    if (!conversation?.model) return;
    const match = chatModels.find((item) => item.model_id === conversation.model
      && (!conversation.provider_id || item.provider_id === conversation.provider_id));
    if (match) setModelKey(match.id);
  }, [chatModels, conversationId, convs]);

  const loadMessages = useCallback(async (id: string): Promise<ChatMessage[]> => {
    try {
      const msgs = await api.get<ChatMessage[]>(`/conversations/${id}/messages`);
      setMessages(msgs);
      const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant?.metadata?.contextUsed) {
        setLastUsedCtx((lastAssistant.metadata?.contextUsed as { items?: ContextItem[] }).items || []);
      }
      return msgs;
    } catch {
      setMessages([]);
      return [];
    }
  }, []);

  useEffect(() => {
    if (conversationId) loadMessages(conversationId);
    else setMessages([]);
  }, [conversationId, loadMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, streamText, sending]);

  const newConversation = () => {
    setConversationId(null);
    setMessages([]);
    setStreamText('');
    setSendError('');
    setProposals([]);
    setLastUsedCtx([]);
    setPinnedCtx([]);
  };

  const runAutoPropose = async (text: string) => {
    try {
      setProposing(true);
      const r = await api.post<{ ok: boolean; proposals: AiProposal[] }>('/ai/propose', { message: text });
      if (r.ok && r.proposals?.length) setProposals(r.proposals);
    } catch {
      setProposals([]);
    } finally {
      setProposing(false);
    }
  };

  const send = async (textOverride?: string, regenerateExisting = false, reuseUserMessage = false) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;
    setInput('');
    setLastPrompt(text);
    setSendError('');
    setSending(true);
    setStreamText('');
    setProposals([]);
    abortRef.current = new AbortController();
    stopSpeaking();
    playSend();
    let activeConv = conversationId;

    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      conversation_id: activeConv || '',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    if (!regenerateExisting && !reuseUserMessage) setMessages((m) => [...m, userMsg]);

    let acc = '';
    try {
      await streamChat(
        {
          content: text,
          conversation_id: activeConv || undefined,
          assistant_id: assistantId || undefined,
          model: selectedModel?.model_id,
          provider_id: selectedModel?.provider_id,
          mode: mode || 'general',
          regenerate: regenerateExisting,
        },
        {
          onStart: (info) => {
            activeConv = info.conversation_id;
            setConversationId(info.conversation_id);
          },
          onDelta: (delta) => {
            acc += delta;
            setStreamText(acc);
          },
          onDone: async (info) => {
            setStreamText('');
            setSendError(info.partial ? (info.warning || t('chat.partialWarning')) : '');
            playNotify();
            if (info.contextUsed && typeof info.contextUsed === 'object') {
              const used = info.contextUsed as ContextUsed & { items?: ContextItem[] };
              setLastUsedCtx(used.items || []);
            }
            if (activeConv) {
              setConversationId(activeConv);
              await loadMessages(activeConv);
            }
            refetchConvs();
            if (useAppStore.getState().settings.ai?.autoActions !== false) {
              void runAutoPropose(text);
            }
          },
          onError: (msg) => {
            setSendError(msg);
            if (!acc) setStreamText('');
          },
          signal: abortRef.current.signal,
        },
      );
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        setSendError(error instanceof Error ? error.message : t('chat.connectionError'));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };
  const stop = () => {
    abortRef.current?.abort();
    setSending(false);
    setSendError(streamText ? t('chat.stoppedWarning') : '');
  };

  const updateConv = async (id: string, patch: Partial<Conversation>) => {
    await api.put(`/conversations/${id}`, patch);
    refetchConvs();
  };

  const deleteConv = async (c: Conversation) => {
    await api.del(`/conversations/${c.id}`);
    if (conversationId === c.id) newConversation();
    refetchConvs();
  };
  const deleteMsg = async (m: ChatMessage) => {
    await api.del(`/messages/${m.id}`);
    if (conversationId) loadMessages(conversationId);
  };

  const exportConv = async (c: Conversation) => {
    const data = await api.get<ConversationExport>(`/conversations/${c.id}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${c.title || 'conversation'}-${c.id.slice(-6)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importChats = async (file: File) => {
    setImporting(true);
    setImportMsg('');
    try {
      const text = await file.text();
      const r = await api.post<{ ok: boolean; imported: number; error?: string }>('/conversations/import', { content: text });
      if (r.ok) {
        setImportMsg(`${t('chat.importDone')}: ${r.imported}`);
        refetchConvs();
      } else {
        setImportMsg(r.error || t('chat.importFail'));
      }
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : t('chat.importFail'));
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const categorize = async (c: Conversation) => {
    setCategorizing(true);
    setCategorySuggestion(null);
    setShowCategorize(c);
    try {
      const r = await api.post<{ ok: boolean; suggested?: { folder: string | null; tags: string[] }; error?: string }>(
        `/conversations/${c.id}/categorize`,
      );
      if (r.ok && r.suggested) setCategorySuggestion(r.suggested);
      else setCategorySuggestion(null);
    } catch {
      setCategorySuggestion(null);
    } finally {
      setCategorizing(false);
    }
  };

  const applyCategory = async () => {
    if (!showCategorize || !categorySuggestion) return;
    await updateConv(showCategorize.id, { folder: categorySuggestion.folder || undefined, tags: categorySuggestion.tags });
    // Ensure the folder exists so it shows in the folder list.
    if (categorySuggestion.folder) {
      const exists = (folders || []).some((f) => f.name === categorySuggestion.folder);
      if (!exists) await api.post('/folders', { name: categorySuggestion.folder });
      refetchFolders();
    }
    setShowCategorize(null);
    setCategorySuggestion(null);
  };

  const regenerate = async (m: ChatMessage) => {
    if (!conversationId || sending) return;
    const assistantIndex = messages.findIndex((item) => item.id === m.id);
    const previousUser = assistantIndex > 0
      ? [...messages.slice(0, assistantIndex)].reverse().find((item) => item.role === 'user')
      : null;
    if (!previousUser) return;

    setMessages((current) => current.filter((item) => item.id !== m.id));
    await api.del(`/messages/${m.id}`);
    setLastPrompt(previousUser.content);
    setSendError('');
    setSending(true);
    setStreamText('');
    abortRef.current = new AbortController();
    let acc = '';
    try {
      await streamChat(
        {
          content: previousUser.content,
          conversation_id: conversationId,
          assistant_id: assistantId || undefined,
          model: selectedModel?.model_id,
          provider_id: selectedModel?.provider_id,
          mode: mode || 'general',
          regenerate: true,
        },
        {
          onDelta: (d) => {
            acc += d;
            setStreamText(acc);
          },
          onDone: async (info) => {
            setStreamText('');
            setSendError(info.partial ? (info.warning || t('chat.partialWarning')) : '');
            if (info.contextUsed && typeof info.contextUsed === 'object') {
              const used = info.contextUsed as ContextUsed & { items?: ContextItem[] };
              setLastUsedCtx(used.items || []);
            }
            await loadMessages(conversationId);
            refetchConvs();
          },
          onError: (msg) => {
            setSendError(msg);
            if (!acc) setStreamText('');
          },
          signal: abortRef.current.signal,
        },
      );
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        setSendError(error instanceof Error ? error.message : t('chat.connectionError'));
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };

  const currentConv = convs?.find((c) => c.id === conversationId);
  const aiReady = !aiStatus || (
    chatModels.length > 0
    && aiStatus.providers.some((provider) => (provider.status === 'connected' || provider.status === 'configured') && provider.modelCount > 0)
  );
  const aiBlocked = aiStatus?.privacyBlocked === true || aiStatus?.providers.some((provider) => provider.status === 'blocked') === true;
  const activeProvider = aiStatus?.providers.find((provider) => provider.isPrimary || Boolean(provider.is_primary))
    || aiStatus?.providers.find((provider) => (provider.status === 'connected' || provider.status === 'configured') && provider.modelCount > 0);

  return (
    <div className="flex min-h-[calc(100dvh-9rem)] flex-col md:flex-row md:gap-4 lg:min-h-[calc(100dvh-8rem)]">
      {/* ======= Conversations sidebar ======= */}
      <aside className="mb-4 w-full shrink-0 md:mb-0 md:w-72">
        <div className="flex gap-2">
          <Button className="flex-1" onClick={newConversation}>
            <Plus className="h-4 w-4" /> {t('chat.newChat')}
          </Button>
          <Button variant="ghost" className="!px-3" onClick={() => fileRef.current?.click()} disabled={importing} title={t('chat.importChats')} aria-label={t('chat.importChats')}>
            {importing ? <Spinner className="h-4 w-4" /> : <Import className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" className="!px-3" onClick={() => setShowFoldersModal(true)} title={t('chat.manageFolders')} aria-label={t('chat.manageFolders')}>
            <Folders className="h-4 w-4" />
          </Button>
        </div>
        <input ref={fileRef} type="file" accept=".json,.md,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && importChats(e.target.files[0])} />
        {importMsg && <p className="mt-1 text-xs font-semibold text-ink-faint">{importMsg}</p>}

        <div className="relative mt-2">
          <Search className="absolute top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint rtl:right-3 ltr:left-3" />
          <input
            className="input !py-2 ps-9"
            placeholder={t('chat.searchPlaceholder')}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <select
            className="input !w-auto !py-1.5 text-xs"
            value={folderFilter}
            onChange={(e) => setFolderFilter(e.target.value)}
            aria-label={t('chat.folders')}
          >
            <option value="">{t('chat.allFolders')}</option>
            {(folders || []).map((f) => (
              <option key={f.id} value={f.name}>{f.name}</option>
            ))}
            <option value="__none__">{t('chat.noFolder')}</option>
          </select>
          {allTags.length > 0 && (
            <select className="input !w-auto !py-1.5 text-xs" value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label={t('chat.filterTag')}>
              <option value="">{t('chat.filterTag')} {t('common.all')}</option>
              {allTags.map((tg) => (
                <option key={tg} value={tg}>{tg}</option>
              ))}
            </select>
          )}
        </div>

        <div className="mt-2 max-h-72 space-y-1 overflow-y-auto md:max-h-[calc(100vh-320px)]">
          {visibleConvs.length === 0 && (
            <p className="px-2 py-4 text-center text-xs text-ink-faint">{t('common.none')}</p>
          )}
          {visibleConvs.map((c) => (
            <ConversationRow
              key={c.id}
              conv={c}
              active={c.id === conversationId}
              menuOpen={menuFor === c.id}
              renaming={renameId === c.id}
              renameText={renameText}
              editingTags={tagEditId === c.id}
              tagEditText={tagEditText}
              folders={folders || []}
              onSelect={() => setConversationId(c.id)}
              onToggleMenu={() => setMenuFor(menuFor === c.id ? null : c.id)}
              onCloseMenu={() => setMenuFor(null)}
              onRenameStart={() => { setRenameId(c.id); setRenameText(c.title); setMenuFor(null); }}
              onRenameChange={setRenameText}
              onRenameCommit={async () => {
                if (renameText.trim()) await updateConv(c.id, { title: renameText.trim() });
                setRenameId(null);
              }}
              onRenameCancel={() => setRenameId(null)}
              onMoveFolder={(f) => updateConv(c.id, { folder: f || null })}
              onTagsStart={() => { setTagEditId(c.id); setTagEditText((c.tags || []).join(', ')); setMenuFor(null); }}
              onTagsChange={setTagEditText}
              onTagsCommit={async () => {
                await updateConv(c.id, { tags: tagEditText.split(',').map((x) => x.trim()).filter(Boolean) });
                setTagEditId(null);
              }}
              onTagsCancel={() => setTagEditId(null)}
              onTogglePin={() => updateConv(c.id, { pinned: !c.pinned })}
              onCategorize={() => categorize(c)}
              onExport={() => exportConv(c)}
              onDelete={() => deleteConv(c)}
            />
          ))}
        </div>
      </aside>

      {/* ======= Chat ======= */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <label className="text-xs font-bold text-ink-faint">{t('chat.assistant')}</label>
            <select className="input !w-44 !py-1.5 text-sm" value={assistantId} onChange={(e) => setAssistantId(e.target.value)} aria-label={t('chat.assistant')}>
              {(assistants || []).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => refetchAiStatus()}
            className={`chip cursor-pointer ${aiBlocked ? '!bg-warn-bg !text-warn' : aiReady ? '!bg-ok-bg !text-ok' : '!bg-danger-bg !text-danger'}`}
            title={activeProvider?.model || activeProvider?.name}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${aiBlocked ? 'bg-warn' : aiReady ? 'bg-ok' : 'bg-danger'}`} />
            {aiBlocked ? t('ai.blocked') : aiReady ? (activeProvider?.name || t('ai.ready')) : t('ai.offline')}
          </button>
          <div className="flex items-center gap-1">
            <label className="text-xs font-bold text-ink-faint">{t('chat.model')}</label>
            <select
              className="input !w-48 !py-1.5 text-sm"
              value={modelKey}
              onChange={(e) => setModelKey(e.target.value)}
              aria-label={t('chat.model')}
              title={selectedModel?.model_id}
              disabled={!chatModels.length}
            >
              {!chatModels.length && <option value="">{t('chat.noModelConfigured')}</option>}
              {chatModels.map((m) => (
                <option key={m.id} value={m.id} title={m.model_id}>{friendlyModelName(m, lang)}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs font-bold text-ink-faint">{t('chat.mode')}</label>
            <select className="input !w-32 !py-1.5 text-sm" value={mode} onChange={(e) => setMode(e.target.value)} aria-label={t('chat.mode')}>
              {contextModes.map((m) => (
                <option key={m} value={m}>{t(`chat.mode${m.charAt(0).toUpperCase() + m.slice(1)}`)}</option>
              ))}
            </select>
          </div>
          {currentConv && (
            <div className="ms-auto flex min-w-0 items-center gap-1.5">
              {currentConv.folder && <Badge tone="brand"><FolderOpen className="h-3 w-3" /> {currentConv.folder}</Badge>}
              {(currentConv.tags || []).slice(0, 2).map((tg) => <Badge key={tg} tone="neutral">#{tg}</Badge>)}
            </div>
          )}
        </div>

        {/* Context chips */}
        {(pinnedCtx.length > 0 || lastUsedCtx.length > 0 || conversationId) && (
          <div className="mb-3 rounded-xl border border-line bg-elevated/60 px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-bold text-ink-faint">{t('chat.contextChips')}:</span>
              {pinnedCtx.map((c) => (
                <span key={`pinned-${c.type}-${c.id}`} className="relative inline-flex">
                  <EntityChip type={c.type} id={c.id} title={c.title} />
                  <button
                    onClick={async () => {
                      const next = pinnedCtx.filter((x) => !(x.type === c.type && x.id === c.id));
                      setPinnedCtx(next);
                      await api.put(`/conversations/${conversationId}/context`, { items: next });
                    }}
                    className="absolute -end-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[9px] text-white"
                    title={t('chat.removeContext')}
                  >
                    ✕
                  </button>
                </span>
              ))}
              {pinnedCtx.length === 0 && <span className="text-xs text-ink-faint">{t('chat.noContext')}</span>}
              <button onClick={() => setCtxPickerOpen(true)} className="chip cursor-pointer !bg-brand-soft hover:!bg-brand-lighter">
                + {t('chat.addContext')}
              </button>
            </div>
            {lastUsedCtx.length > 0 && (
              <div className="mt-1.5 border-t border-line pt-1.5">
                <span className="text-[11px] font-bold text-ink-faint">{t('chat.contextUsedLast')}: </span>
                <span className="flex flex-wrap gap-1.5">
                  {lastUsedCtx.slice(0, 8).map((c, i) => (
                    <span key={`used-${i}`} className="inline-flex items-center gap-1 rounded-pill bg-elevated px-2.5 py-0.5 text-[11px] text-ink-soft" title={c.why}>
                      {c.title.slice(0, 30)}{c.pinned ? ' 📌' : ''}
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto pb-4">
          {messages.length === 0 && !sending && <EmptyState text={t('chat.noConversation')} />}
          {messages.map((m) => (
            <MessageBubble
              key={m.id}
              msg={m}
              onInspect={() => setInspector(m.metadata?.contextUsed || null)}
              onDelete={() => deleteMsg(m)}
              onRegenerate={() => regenerate(m)}
              canInspect={m.role === 'assistant' && !!m.metadata?.contextUsed}
            />
          ))}
          {streamText && (
            <div className="max-w-[88%] rounded-bubble rounded-br-md border border-line bg-card p-4" aria-live="polite">
              <div className="mb-1 flex items-center gap-1.5 text-brand-dark">
                <Leaf className="h-3.5 w-3.5" />
                <span className="text-xs font-bold">{sending ? t('chat.thinking') : t('chat.partialWarning')}</span>
              </div>
              <Markdown content={streamText} />
            </div>
          )}
          {sending && !streamText && (
            <div className="flex items-center gap-2 p-2 text-ink-faint">
              <Spinner className="h-4 w-4" />
              <span className="text-sm">{t('chat.generating')}</span>
            </div>
          )}
          {!sending && (proposals.length > 0 || proposing) && (
            <div className="max-w-[90%]">
              {proposing && !proposals.length && (
                <p className="flex items-center gap-2 text-xs text-ink-faint">
                  <Spinner className="h-3.5 w-3.5" /> {t('ai.thinking2')}
                </p>
              )}
              <AiActionCards proposals={proposals} />
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-line pt-3">
          {(!aiReady || aiBlocked) && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-warn-border bg-warn-bg px-3 py-2 text-sm text-warn" role="status">
              <span className="flex-1">{aiBlocked ? t('chat.aiPrivacyBlocked') : t('chat.aiNeedsSetup')}</span>
              <Link to="/settings" className="font-bold underline">{t('chat.openSettings')}</Link>
            </div>
          )}
          {sendError && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-danger-border bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              <div className="min-w-0 flex-1">
                <p className="font-bold">{t('chat.connectionError')}</p>
                <p className="mt-0.5 break-words text-xs">{sendError}</p>
              </div>
              {lastPrompt && (
                <Button variant="ghost" className="!border-danger-border !px-3 !py-1.5 text-xs" onClick={() => send(lastPrompt, Boolean(conversationId), true)} disabled={sending}>
                  <RefreshCw className="h-3.5 w-3.5" /> {t('chat.retryLast')}
                </Button>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <VoiceInputButton onFinal={(text) => setInput((v) => (v ? `${v} ` : '') + text)} />
            <textarea
              className="input max-h-40 min-h-[52px] flex-1 resize-y"
              placeholder={t('chat.placeholder')}
              aria-label={t('chat.placeholder')}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            {sending ? (
              <Button variant="danger" onClick={stop}>
                <Square className="h-4 w-4" /> {t('chat.stop')}
              </Button>
            ) : (
              <Button onClick={() => send()} disabled={!input.trim() || !aiReady || aiBlocked}>
                <Send className="h-4 w-4" /> {t('chat.send')}
              </Button>
            )}
          </div>
          <p className="mt-1 px-1 text-[11px] text-ink-faint">{t('chat.enterHint')}</p>
        </div>
      </div>

      {/* ======= Modals ======= */}

      {/* Context inspector */}
      <Modal open={!!inspector} onClose={() => setInspector(null)} title={t('chat.whyAITold')}>
        {inspector && (
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-ink">{t('chat.contextUsed')}</p>
            {inspector.memories !== undefined && <Row used={inspector.memories > 0} label={lang === 'en' ? `Memories (${inspector.memories})` : `ذكريات (${inspector.memories})`} />}
            {inspector.tasks !== undefined && <Row used={inspector.tasks > 0} label={lang === 'en' ? `Tasks (${inspector.tasks})` : `مهام (${inspector.tasks})`} />}
            {inspector.goals !== undefined && <Row used={inspector.goals > 0} label={lang === 'en' ? `Goals (${inspector.goals})` : `أهداف (${inspector.goals})`} />}
            {inspector.schedule !== undefined && <Row used={inspector.schedule > 0} label={lang === 'en' ? `Schedule (${inspector.schedule})` : `جدول (${inspector.schedule})`} />}
            {inspector.checkins !== undefined && <Row used={inspector.checkins > 0} label={lang === 'en' ? `Check-ins (${inspector.checkins})` : `تسجيلات حالة (${inspector.checkins})`} />}
            {inspector.study !== undefined && <Row used={inspector.study > 0} label={lang === 'en' ? `Study (${inspector.study})` : `دراسة (${inspector.study})`} />}
            {inspector.work !== undefined && <Row used={inspector.work > 0} label={lang === 'en' ? `Work (${inspector.work})` : `عمل (${inspector.work})`} />}
            {inspector.journal !== undefined && <Row used={inspector.journal > 0} label={lang === 'en' ? `Journal (${inspector.journal})` : `يوميات (${inspector.journal})`} />}
            {inspector.focus !== undefined && <Row used={inspector.focus > 0} label={lang === 'en' ? `Focus (${inspector.focus})` : `تركيز (${inspector.focus})`} />}
            {inspector.gratitude !== undefined && <Row used={inspector.gratitude > 0} label={lang === 'en' ? `Gratitude (${inspector.gratitude})` : `امتنان (${inspector.gratitude})`} />}
            {inspector.conversations !== undefined && <Row used={inspector.conversations > 0} label={lang === 'en' ? `Past chats (${inspector.conversations})` : `محادثات سابقة (${inspector.conversations})`} />}
            {inspector.knowledge !== undefined && <Row used={inspector.knowledge > 0} label={lang === 'en' ? `Knowledge (${inspector.knowledge})` : `معرفة (${inspector.knowledge})`} />}
            {inspector.safePlan !== undefined && <Row used={!!inspector.safePlan} label={lang === 'en' ? 'Safe living plan' : 'خطة العيش الآمن'} />}
            <p className="pt-2 font-semibold text-ink">{t('chat.contextNotUsed')}</p>
            <p className="text-ink-faint">
              {lang === 'en'
                ? 'Journal, work notes, and financial data are not read unless the assistant is explicitly allowed.'
                : 'اليوميات وملاحظات العمل والبيانات المالية لا تُقرأ إلا إذا سُمح للمساعد بذلك صراحةً.'}
            </p>
          </div>
        )}
      </Modal>

      {/* Folders management */}
      <Modal open={showFoldersModal} onClose={() => setShowFoldersModal(false)} title={t('chat.manageFolders')}>
        <FoldersManager folders={folders || []} onChanged={() => { refetchFolders(); refetchConvs(); }} />
      </Modal>

      {/* Context picker */}
      <Modal open={ctxPickerOpen} onClose={() => setCtxPickerOpen(false)} title={t('chat.contextAttach')}>
        <div className="space-y-2">
          <input
            autoFocus
            className="input"
            placeholder={t('search.placeholder')}
            value={ctxSearch}
            onChange={(e) => {
              setCtxSearch(e.target.value);
              if (e.target.value.trim().length >= 2) {
                api.get<SearchResults>(`/search?q=${encodeURIComponent(e.target.value.trim())}`).then(setCtxResults).catch(() => setCtxResults(null));
              } else {
                setCtxResults(null);
              }
            }}
          />
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {(ctxResults?.groups || []).map((g) => (
              <div key={g.type}>
                <p className="text-[10px] font-bold text-ink-faint">{g.label}</p>
                {g.items.map((item) => {
                  const added = pinnedCtx.some((c) => c.type === g.type && c.id === item.id);
                  return (
                    <button
                      key={`${g.type}:${item.id}`}
                      disabled={added}
                      className="menu-item disabled:opacity-40"
                      onClick={async () => {
                        const next = [...pinnedCtx, { type: g.type, id: item.id, title: item.title }];
                        setPinnedCtx(next);
                        await api.put(`/conversations/${conversationId}/context`, { items: next });
                      }}
                    >
                      <span className="min-w-0 flex-1 truncate text-start">{item.title}</span>
                      {added ? <span className="text-xs text-ok">✓</span> : <span className="text-xs text-brand-dark">+</span>}
                    </button>
                  );
                })}
              </div>
            ))}
            {ctxResults && ctxResults.total === 0 && <p className="text-sm text-ink-faint">{t('search.noResults')}</p>}
            {!ctxResults && <p className="text-sm text-ink-faint">{t('chat.contextAttach')}</p>}
          </div>
        </div>
      </Modal>

      {/* AI categorization */}
      <Modal open={!!showCategorize} onClose={() => setShowCategorize(null)} title={t('chat.categorize')}>
        <div className="space-y-3">
          <p className="text-sm text-ink-faint">{t('chat.categorizeHint')}</p>
          {categorizing ? (
            <div className="flex items-center gap-2 text-sm text-ink-faint">
              <Spinner className="h-4 w-4" /> {t('ai.thinking')}
            </div>
          ) : categorySuggestion ? (
            <div className="space-y-3">
              <div className="rounded-xl bg-elevated p-3">
                <p className="mb-1.5 text-xs font-bold text-ink-faint">{t('chat.folders')}</p>
                <p className="text-sm font-bold text-ink">{categorySuggestion.folder || t('chat.noFolder')}</p>
                {categorySuggestion.tags.length > 0 && (
                  <>
                    <p className="mb-1.5 mt-2 text-xs font-bold text-ink-faint">{t('common.tags')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {categorySuggestion.tags.map((tg) => <Badge key={tg} tone="brand">#{tg}</Badge>)}
                    </div>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowCategorize(null)}>{t('common.cancel')}</Button>
                <Button onClick={applyCategory}><Sparkles className="h-4 w-4" /> {t('chat.apply')}</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink-faint">{t('ai.fallbackReply')}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

/* ================= Conversation row ================= */

function ConversationRow({
  conv,
  active,
  menuOpen,
  renaming,
  renameText,
  editingTags,
  tagEditText,
  folders,
  onSelect,
  onToggleMenu,
  onCloseMenu,
  onRenameStart,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onMoveFolder,
  onTagsStart,
  onTagsChange,
  onTagsCommit,
  onTagsCancel,
  onTogglePin,
  onCategorize,
  onExport,
  onDelete,
}: {
  conv: Conversation;
  active: boolean;
  menuOpen: boolean;
  renaming: boolean;
  renameText: string;
  editingTags: boolean;
  tagEditText: string;
  folders: Folder[];
  onSelect: () => void;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  onRenameStart: () => void;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onMoveFolder: (folder: string | null) => void;
  onTagsStart: () => void;
  onTagsChange: (v: string) => void;
  onTagsCommit: () => void;
  onTagsCancel: () => void;
  onTogglePin: () => void;
  onCategorize: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [moving, setMoving] = useState(false);

  return (
    <div className={`group relative rounded-xl transition ${active ? 'bg-brand-soft' : 'hover:bg-elevated'}`}>
      {renaming ? (
        <div className="flex items-center gap-1 px-2 py-1.5">
          <input
            autoFocus
            className="input !py-1 text-sm"
            value={renameText}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit();
              if (e.key === 'Escape') onRenameCancel();
            }}
          />
          <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={onRenameCommit}>
            {t('common.save')}
          </Button>
        </div>
      ) : (
        <div className="flex cursor-pointer items-center gap-2 px-3 py-2" onClick={onSelect}>
          <MessageSquare className="h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-ink">{conv.title || '…'}</span>
            <span className="block truncate text-[11px] text-ink-faint">
              {conv.folder && <>{conv.folder} • </>}
              {(conv.tags || []).slice(0, 2).join(' #')}
            </span>
          </div>
          {conv.pinned && <Pin className="h-3 w-3 shrink-0 text-brand-dark" />}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
            className="btn-icon !h-7 !w-7 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
            aria-label={t('common.actions')}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Dropdown menu */}
      {menuOpen && !renaming && (
        <div className="absolute start-0 end-0 z-20 mt-0.5 rounded-xl border border-line bg-card p-1.5 shadow-card-hover animate-fadeIn">
          <button className="menu-item" onClick={() => { onRenameStart(); onCloseMenu(); }}>
            <Pencil className="h-4 w-4" /> {t('chat.rename')}
          </button>
          {moving ? (
            <div className="px-2 py-1">
              <Select
                value={conv.folder || ''}
                onChange={(v) => { onMoveFolder(v || null); setMoving(false); onCloseMenu(); }}
                label={t('chat.folders')}
                className="!py-1 text-xs"
              >
                <option value="">{t('chat.noFolder')}</option>
                {folders.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
              </Select>
            </div>
          ) : (
            <button className="menu-item" onClick={() => setMoving(true)}>
              <FolderPlus className="h-4 w-4" /> {t('chat.folders')}
            </button>
          )}
          <button className="menu-item" onClick={() => { onTagsStart(); onCloseMenu(); }}>
            <Tag className="h-4 w-4" /> {t('common.tags')}
          </button>
          <button className="menu-item" onClick={() => { onCategorize(); onCloseMenu(); }}>
            <Sparkles className="h-4 w-4" /> {t('chat.categorize')}
          </button>
          <button className="menu-item" onClick={() => { onTogglePin(); onCloseMenu(); }}>
            <Pin className="h-4 w-4" /> {conv.pinned ? t('chat.unpin') : t('chat.pin')}
          </button>
          <button className="menu-item" onClick={() => { onExport(); onCloseMenu(); }}>
            <Import className="h-4 w-4 rotate-180" /> {t('chat.exportChat')}
          </button>
          <button className="menu-item !text-danger" onClick={() => { onDelete(); onCloseMenu(); }}>
            <Trash2 className="h-4 w-4" /> {t('chat.deleteConv')}
          </button>
        </div>
      )}

      {/* Inline tag editing */}
      {editingTags && (
        <div className="flex items-center gap-1 px-2 pb-2">
          <input
            autoFocus
            className="input !py-1 text-sm"
            placeholder={t('chat.tagsPlaceholder')}
            value={tagEditText}
            onChange={(e) => onTagsChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onTagsCommit();
              if (e.key === 'Escape') onTagsCancel();
            }}
          />
          <Button variant="ghost" className="!px-2 !py-1 text-xs" onClick={onTagsCommit}>
            {t('common.save')}
          </Button>
        </div>
      )}
    </div>
  );
}

/* ================= Folders manager ================= */

function FoldersManager({ folders, onChanged }: { folders: Folder[]; onChanged: () => void }) {
  const t = useT();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  const add = async () => {
    if (!name.trim()) return;
    await api.post('/folders', { name: name.trim() });
    setName('');
    onChanged();
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className="input" placeholder={t('chat.newFolder')} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button onClick={add} aria-label={t('common.add')}><Plus className="h-4 w-4" /></Button>
      </div>
      {folders.length === 0 ? (
        <p className="text-sm text-ink-faint">{t('common.none')}</p>
      ) : (
        folders.map((f) => (
          <div key={f.id} className="flex items-center gap-2 rounded-xl bg-elevated px-3 py-2">
            <FolderOpen className="h-4 w-4 shrink-0 text-brand-dark" />
            {renaming === f.id ? (
              <input
                autoFocus
                className="input flex-1 !py-1 text-sm"
                value={renameText}
                onChange={(e) => setRenameText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    api.put(`/folders/${f.id}`, { name: renameText.trim() }).then(onChanged);
                    setRenaming(null);
                  }
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
            ) : (
              <span className="flex-1 text-sm font-semibold text-ink">{f.name}</span>
            )}
            <span className="text-xs text-ink-faint">{f.count ?? 0}</span>
            <button className="btn-icon !h-7 !w-7" onClick={() => { setRenaming(f.id); setRenameText(f.name); }} aria-label={t('common.edit')}>
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              className="btn-icon !h-7 !w-7"
              aria-label={t('common.delete')}
              onClick={async () => {
                await api.del(`/folders/${f.id}`);
                onChanged();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/* ================= Message bubble ================= */

function Row({ used, label }: { used: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-elevated px-3 py-1.5">
      <span className="text-ink-soft">{label}</span>
      <span className={used ? 'font-bold text-ok' : 'text-ink-faint'}>{used ? '✓' : '○'}</span>
    </div>
  );
}

function MessageBubble({
  msg,
  onInspect,
  onDelete,
  onRegenerate,
  canInspect,
}: {
  msg: ChatMessage;
  onInspect: () => void;
  onDelete: () => void;
  onRegenerate: () => void;
  canInspect: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === 'user';

  if (isUser) {
    return (
      <div className="fade-in flex justify-end">
        <div className="max-w-[85%] rounded-bubble rounded-bl-md bg-brand-soft px-4 py-3 text-[15px] font-medium leading-relaxed text-ink">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in group max-w-[90%]">
      <div className="rounded-bubble rounded-br-md border border-line bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-soft text-brand-dark">
            <Leaf className="h-4 w-4" />
          </span>
          <span className="text-xs font-bold text-ink-faint">{msg.model || 'عِش آمن'}</span>
          <div className="ms-auto flex items-center gap-0.5 md:invisible md:group-hover:visible md:group-focus-within:visible">
            <SpeakButton text={msg.content} className="!h-7 !w-7" />
            {canInspect && (
              <button onClick={onInspect} className="btn-icon !h-7 !w-7" title={t('chat.whyAITold')}>
                <Eye className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => {
                navigator.clipboard.writeText(msg.content);
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              }}
              className="btn-icon !h-7 !w-7"
              title={t('chat.copy')}
            >
              {copied ? <span className="text-ok">✓</span> : <Copy className="h-3.5 w-3.5" />}
            </button>
            <button onClick={onRegenerate} className="btn-icon !h-7 !w-7" title={t('chat.regenerate')}>
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} className="btn-icon !h-7 !w-7" title={t('chat.deleteMessage')}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <Markdown content={msg.content} />
      </div>
    </div>
  );
}
