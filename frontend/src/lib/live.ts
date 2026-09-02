/**
 * LiveBus — a singleton Server-Sent-Events connection to the backend's
 * domain event stream. Every page subscribes through useApi so data updates
 * itself automatically: create a task, save a journal, complete a focus
 * session — every open panel refreshes without a manual reload.
 */
import { cloudConfigured } from '../cloud/client';

export interface LiveEvent {
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  ts: string;
}

type Handler = (e: LiveEvent) => void;

class LiveBus {
  private es: EventSource | null = null;
  private handlers = new Set<Handler>();
  private started = false;

  start() {
    if (this.started) return;
    this.started = true;
    // Single source of truth for cloud detection (same trimmed logic as
    // lib/api + AuthProvider). In cloud mode, live updates arrive through
    // Supabase Realtime; locally they arrive through SSE.
    if (!cloudConfigured) {
      try {
        this.es = new EventSource('/api/events/stream');
        this.es.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data) as LiveEvent;
            for (const h of this.handlers) h(data);
          } catch {
            /* ignore malformed */
          }
        };
        // EventSource auto-reconnects on error — nothing to do here.
      } catch {
        /* EventSource unsupported → polling fallback below */
      }
    }
    // When the window regains focus, refresh everything once.
    window.addEventListener('focus', this.onFocus);
    // Polling fallback / safety net for environments without SSE.
    window.setInterval(() => this.emitRefresh(), 30000);
  }

  private onFocus = () => this.emitRefresh();

  private emitRefresh() {
    this.dispatch({ event_type: 'AppFocus', entity_type: null, entity_id: null, summary: '', ts: new Date().toISOString() });
  }

  private dispatch(e: LiveEvent) {
    for (const h of [...this.handlers]) {
      try {
        h(e);
      } catch {
        /* one bad subscriber must not break others */
      }
    }
  }

  /** Subscribe to live events; returns an unsubscribe function. */
  subscribe(h: Handler): () => void {
    this.handlers.add(h);
    if (!this.started) this.start();
    return () => {
      this.handlers.delete(h);
    };
  }

  isConnected(): boolean {
    return this.es?.readyState === EventSource.OPEN;
  }

  /** Push a Supabase Realtime change through the same refresh bus as local SSE. */
  emitCloud(entityType: string, entityId: string) {
    this.dispatch({
      event_type: 'CloudRecordChanged',
      entity_type: entityType,
      entity_id: entityId,
      summary: '',
      ts: new Date().toISOString(),
    });
  }
}

export const liveBus = new LiveBus();
