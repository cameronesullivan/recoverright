"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ChatApiResponse } from "@/lib/api-types";
import type { ChatMessage } from "@/lib/plan-schema";
import { planStore, type SavedPlan } from "@/lib/storage";

const SUGGESTIONS = [
  "Which exercises should I focus on this week?",
  "Is it normal to still have pain at this stage?",
  "What should I ask my surgeon at my next visit?",
  "Is any of the alternative therapies worth asking my doctor about?",
];

const MAX_QUESTION = 2000;

export function PlanChat({ saved }: { saved: SavedPlan }) {
  const [messages, setMessages] = useState<ChatMessage[]>(saved.chat);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    if (text.length > MAX_QUESTION) {
      setError("Please keep your question under 2,000 characters.");
      return;
    }

    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    setError(null);
    setPending(true);

    let result: ChatApiResponse;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: saved.plan,
          intake: saved.intake,
          planStartDate: saved.planStartDate,
          messages: next,
        }),
      });
      result = (await response.json()) as ChatApiResponse;
    } catch {
      result = { status: "error", message: "We couldn't reach the server. Check your connection and try again." };
    }
    setPending(false);

    if (result.status === "error") {
      setError(result.message);
      // Put the question back so it can be retried.
      setMessages(messages);
      setDraft(text);
      return;
    }

    const withReply: ChatMessage[] = [...next, { role: "assistant", content: result.reply }];
    setMessages(withReply);
    planStore.updateChat(saved.id, withReply).catch(() => {
      setError("Your answer is shown, but this conversation couldn't be saved in your browser.");
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  async function clear() {
    if (!window.confirm("Clear this conversation?")) return;
    setMessages([]);
    setError(null);
    await planStore.updateChat(saved.id, []).catch(() => undefined);
  }

  return (
    <section aria-labelledby="chat-title" className="card print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="chat-title" className="text-xl font-semibold text-slate-900">
            Ask about your plan
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Answers are educational and based on your plan. They can&apos;t replace your care team. If you have
            warning signs, call your doctor or 911.
          </p>
        </div>
        {messages.length > 0 && (
          <button type="button" onClick={clear} className="text-sm font-medium text-slate-500 hover:text-slate-800">
            Clear chat
          </button>
        )}
      </div>

      <div
        ref={listRef}
        className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3 sm:p-4"
        aria-live="polite"
      >
        {messages.length === 0 && !pending && (
          <div>
            <p className="text-sm text-slate-500">Try one of these, or type your own question:</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="rounded-full border border-teal-200 bg-white px-3 py-1.5 text-left text-sm text-teal-900 hover:border-teal-400"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 whitespace-pre-wrap ${
                m.role === "user"
                  ? "rounded-br-sm bg-teal-700 text-white"
                  : "rounded-bl-sm border border-slate-200 bg-white text-slate-800"
              }`}
            >
              <span className="sr-only">{m.role === "user" ? "You said: " : "RecoverRight said: "}</span>
              {m.content}
            </div>
          </div>
        ))}

        {pending && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-3">
              <span className="sr-only">RecoverRight is thinking…</span>
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="h-2 w-2 animate-bounce rounded-full bg-teal-500"
                  style={{ animationDelay: `${delay}ms` }}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
          {error}
        </p>
      )}

      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="chat-input" className="sr-only">
          Your question
        </label>
        <textarea
          id="chat-input"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
            }
          }}
          maxLength={MAX_QUESTION}
          placeholder="Ask a question about your plan…"
          className="field-input mt-0 flex-1 resize-none"
        />
        <button type="submit" className="btn-primary sm:self-stretch" disabled={pending || !draft.trim()}>
          {pending ? "Thinking…" : "Send"}
        </button>
      </form>
    </section>
  );
}
