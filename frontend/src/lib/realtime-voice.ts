import { api } from './api';

export type LiveVoiceState = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'muted' | 'error' | 'ended';

export interface LiveVoiceTurn {
  conversation_id: string;
  user_text: string;
  assistant_text: string;
}

export interface LiveVoiceController {
  setMuted: (muted: boolean) => void;
  stop: () => void;
}

interface StartOptions {
  conversationId?: string | null;
  assistantId?: string;
  mode?: string;
  voice?: string;
  language?: string;
  onState: (state: LiveVoiceState) => void;
  onTurn: (turn: LiveVoiceTurn) => void;
  onError: (message: string) => void;
}

interface RealtimeCallAnswer {
  ok: boolean;
  sdp: string;
  model: string;
  voice: string;
  session?: Record<string, unknown>;
}

const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();

function waitForIce(pc: RTCPeerConnection, timeoutMs = 3500) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', changed);
      resolve();
    };
    const changed = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = window.setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', changed);
  });
}

function transcriptFromResponse(event: any): string {
  const parts = event?.response?.output?.flatMap((item: any) => item?.content || []) || [];
  return clean(parts.map((part: any) => part?.transcript || part?.text || '').join(' '));
}

export async function startRealtimeVoice(options: StartOptions): Promise<LiveVoiceController> {
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
    throw new Error('المتصفح الحالي لا يدعم المحادثة الصوتية المباشرة. استخدم Chrome أو Edge حديثًا.');
  }

  options.onState('connecting');
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const pc = new RTCPeerConnection();
  const audio = new Audio();
  audio.autoplay = true;
  audio.setAttribute('playsinline', 'true');
  const dataChannel = pc.createDataChannel('oai-events');
  let stopped = false;
  let muted = false;
  let conversationId = options.conversationId || '';
  let pendingUser = '';
  let pendingAssistant = '';
  let flushTimer = 0;
  let flushRunning = false;
  let activeModel = 'gpt-realtime-2.1-mini';
  let sessionConfig: Record<string, unknown> | undefined;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearTimeout(flushTimer);
    dataChannel.close();
    pc.close();
    stream.getTracks().forEach((track) => track.stop());
    audio.pause();
    audio.srcObject = null;
    options.onState('ended');
  };

  const fail = (message: string) => {
    options.onState('error');
    options.onError(message);
  };

  const flushTurn = async () => {
    if (flushRunning || stopped) return;
    const userText = clean(pendingUser);
    const assistantText = clean(pendingAssistant);
    if (!userText || !assistantText) return;
    pendingUser = '';
    pendingAssistant = '';
    flushRunning = true;
    try {
      const saved = await api.post<LiveVoiceTurn>('/voice/turn', {
        conversation_id: conversationId || undefined,
        assistant_id: options.assistantId || undefined,
        mode: options.mode || 'general',
        user_text: userText,
        assistant_text: assistantText,
        model: activeModel,
        provider: 'openai-realtime',
      });
      conversationId = saved.conversation_id;
      options.onTurn(saved);
    } catch (error) {
      options.onError(error instanceof Error ? error.message : 'تم الرد صوتيًا لكن تعذر حفظه في سجل المحادثة.');
    } finally {
      flushRunning = false;
      if (pendingUser && pendingAssistant) scheduleFlush();
    }
  };

  const scheduleFlush = () => {
    window.clearTimeout(flushTimer);
    flushTimer = window.setTimeout(() => void flushTurn(), 650);
  };

  pc.ontrack = (event) => {
    audio.srcObject = event.streams[0];
    void audio.play().catch(() => {});
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') options.onState(muted ? 'muted' : 'listening');
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      fail('انقطع الاتصال الصوتي. تحقق من الإنترنت ثم أعد المحاولة.');
    }
  };
  stream.getTracks().forEach((track) => pc.addTrack(track, stream));

  dataChannel.onopen = () => {
    if (sessionConfig) dataChannel.send(JSON.stringify({ type: 'session.update', session: sessionConfig }));
    options.onState(muted ? 'muted' : 'listening');
  };
  dataChannel.onmessage = (message) => {
    let event: any;
    try { event = JSON.parse(String(message.data || '{}')); } catch { return; }
    const type = String(event.type || '');
    if (type === 'input_audio_buffer.speech_started') options.onState(muted ? 'muted' : 'listening');
    if (type === 'input_audio_buffer.speech_stopped') options.onState('thinking');
    if (type === 'response.output_audio.delta' || type === 'response.audio.delta') options.onState('speaking');
    if (type === 'output_audio_buffer.started') options.onState('speaking');
    if (type === 'output_audio_buffer.stopped') options.onState(muted ? 'muted' : 'listening');
    if (type === 'conversation.item.input_audio_transcription.completed') {
      pendingUser = clean(event.transcript);
      scheduleFlush();
    }
    if (type === 'response.output_audio_transcript.delta' || type === 'response.output_audio.transcript.delta') {
      pendingAssistant += String(event.delta || '');
    }
    if (type === 'response.output_audio_transcript.done' || type === 'response.output_audio.transcript.done') {
      pendingAssistant = clean(event.transcript || pendingAssistant);
      scheduleFlush();
    }
    if (type === 'response.done') {
      pendingAssistant = clean(pendingAssistant || transcriptFromResponse(event));
      scheduleFlush();
      options.onState(muted ? 'muted' : 'listening');
    }
    if (type === 'error') {
      fail(clean(event.error?.message || event.message) || 'حدث خطأ في المحادثة الصوتية.');
    }
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc);
    const answer = await api.post<RealtimeCallAnswer>('/ai/realtime/call', {
      sdp: pc.localDescription?.sdp || offer.sdp,
      conversation_id: conversationId || undefined,
      assistant_id: options.assistantId || undefined,
      mode: options.mode || 'general',
      voice: options.voice || 'alloy',
      language: options.language || 'ar',
    });
    activeModel = answer.model || activeModel;
    sessionConfig = answer.session;
    if (stopped) return { setMuted: () => {}, stop };
    await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
  } catch (error) {
    stop();
    throw error;
  }

  return {
    setMuted(nextMuted: boolean) {
      muted = nextMuted;
      stream.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
      options.onState(nextMuted ? 'muted' : 'listening');
    },
    stop,
  };
}
