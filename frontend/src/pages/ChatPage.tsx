from pathlib import Path
import re

src = Path("/mnt/data/Pasted text(20260826-224919).txt")
text = src.read_text(encoding="utf-8")

new_send = r"""  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || sending) return;

    setInput('');
    setSending(true);
    setStreamText('');
    setProposals([]);

    const controller = new AbortController();
    abortRef.current = controller;

    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      conversation_id: conversationId || '',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    setMessages((current) => [...current, userMsg]);

    try {
      const history = [...messages, userMsg]
        .slice(-20)
        .map((message) => ({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: history,
        }),
        signal: controller.signal,
      });

      const data: any = await response.json();

      if (!response.ok) {
        const apiError =
          typeof data?.error === 'string'
            ? data.error
            : data?.error?.message || data?.message || 'AI request failed';

        throw new Error(apiError);
      }

      const reply = data?.choices?.[0]?.message?.content;

      if (typeof reply !== 'string' || !reply.trim()) {
        throw new Error('AI returned an empty response');
      }

      const assistantMsg: ChatMessage = {
        id: `local-ai-${Date.now()}`,
        conversation_id: conversationId || '',
        role: 'assistant',
        content: reply.trim(),
        created_at: new Date().toISOString(),
        model: 'DeepSeek',
      };

      setMessages((current) => [...current, assistantMsg]);

      // Keep the existing LifeOS automatic action-proposal feature active.
      if (useAppStore.getState().settings.ai?.autoActions !== false) {
        void runAutoPropose(text);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      console.error('DeepSeek error:', error);

      const errorMsg: ChatMessage = {
        id: `local-error-${Date.now()}`,
        conversation_id: conversationId || '',
        role: 'assistant',
        content: 'تعذر الاتصال بالمساعد الآن. حاول مرة أخرى.',
        created_at: new Date().toISOString(),
        model: 'عيش آمن',
      };

      setMessages((current) => [...current, errorMsg]);
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  };
"""

pattern = re.compile(
    r"  const send = async \(textOverride\?: string\) => \{.*?\n\};\n  const stop = \(\) => \{",
    re.S
)

m = pattern.search(text)
if not m:
    raise RuntimeError("Could not locate send() block")

replacement = new_send + "  const stop = () => {"
fixed = text[:m.start()] + replacement + text[m.end():]

out = Path("/mnt/data/ChatPage.fixed.tsx")
out.write_text(fixed, encoding="utf-8")

print(f"Created: {out}")
print("Only the send() block was replaced; the rest of ChatPage was preserved.")
