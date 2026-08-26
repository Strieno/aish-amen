import { useCallback, useState } from 'react';
import { api } from './api';

export interface AiActionResult {
  ok: boolean;
  text?: string;
  error?: string;
  fallback?: boolean;
  kind?: string;
  suggestion?: { title?: string; due?: string | null; priority?: string; energy?: string; content?: string; items?: string[] };
  candidates?: { content: string; type: string; importance: number }[];
  memory?: { id: string };
  answer?: string;
  model?: string;
  privacy?: boolean;
}

interface State {
  loading: boolean;
  result: AiActionResult | null;
}

/**
 * Runs a contextual AI action (interpret, analyze-safe, tutor, ...) with
 * loading + error state. Actions fail gracefully when no model is connected.
 */
export function useAiAction(action: string) {
  const [state, setState] = useState<State>({ loading: false, result: null });

  const run = useCallback(
    async (payload: Record<string, unknown> = {}) => {
      setState({ loading: true, result: null });
      try {
        const result = await api.post<AiActionResult>('/ai/action', { action, ...payload });
        setState({ loading: false, result });
      } catch (e) {
        setState({ loading: false, result: { ok: false, error: e instanceof Error ? e.message : 'error' } });
      }
    },
    [action],
  );

  return { ...state, run };
}
