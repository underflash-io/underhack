"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { rel } from "@/lib/format";

type Session = { id: string; title: string | null; updated_at: string };
type Message = { id: string; role: string; content: string; created_at: string };
type Suggestion = {
  name: string;
  vendor?: string;
  keywords: string[];
  criticality?: string;
  severityThreshold?: string;
  rationale?: string;
};

export default function ChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [busySug, setBusySug] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadSessions = useCallback(async () => {
    const r = await fetch("/api/chat/sessions", { cache: "no-store" });
    if (r.ok) setSessions((await r.json()).sessions);
  }, []);

  const loadSession = useCallback(async (id: string) => {
    const r = await fetch(`/api/chat/sessions/${id}`, { cache: "no-store" });
    if (r.ok) {
      const d = await r.json();
      setMessages(d.messages);
      setActiveId(id);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function newChat() {
    const r = await fetch("/api/chat/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const d = await r.json();
    await loadSessions();
    await loadSession(d.session.id);
    setSuggestions([]);
  }

  async function send() {
    if (!activeId || !draft.trim() || sending) return;
    const text = draft.trim();
    setDraft("");
    setSending(true);
    // optimistic user message
    setMessages((m) => [...m, { id: "tmp_" + Date.now(), role: "user", content: text, created_at: new Date().toISOString() }]);
    const r = await fetch(`/api/chat/sessions/${activeId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    setSending(false);
    if (r.ok) await loadSession(activeId);
  }

  async function loadSuggestions() {
    if (!activeId) return;
    setBusySug(true);
    const r = await fetch(`/api/chat/sessions/${activeId}/suggestions`, { cache: "no-store" });
    if (r.ok) setSuggestions((await r.json()).suggestions);
    setBusySug(false);
  }

  async function applySuggestion(s: Suggestion) {
    if (!activeId) return;
    await fetch(`/api/chat/sessions/${activeId}/suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    setSuggestions((arr) => arr.filter((x) => x !== s));
  }

  return (
    <main className="container">
      <header className="page-head">
        <h1>Intake Chat</h1>
        <p className="muted">
          A guided conversation that walks you through the most consequential publicly disclosed breaches
          of the last decade and turns your answers into monitored-system suggestions.
        </p>
      </header>

      <div className="chat-grid">
        <aside className="chat-sessions">
          <button className="ghost" onClick={newChat} style={{ width: "100%" }}>
            + New conversation
          </button>
          <div className="rows" style={{ padding: 0, marginTop: 12 }}>
            {sessions.map((s) => (
              <button
                key={s.id}
                className="ghost"
                onClick={() => loadSession(s.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  marginBottom: 6,
                  background: activeId === s.id ? "var(--hover)" : "transparent",
                  borderColor: activeId === s.id ? "var(--white)" : "var(--border)",
                  textTransform: "none",
                  letterSpacing: 0,
                  padding: "8px 10px",
                  fontSize: 12,
                }}
              >
                {s.title ?? "untitled"}
                <span className="muted" style={{ display: "block", fontSize: 10, marginTop: 2 }}>
                  {rel(s.updated_at)}
                </span>
              </button>
            ))}
            {sessions.length === 0 && <p className="muted" style={{ fontSize: 12 }}>No conversations yet.</p>}
          </div>
        </aside>

        <section className="chat-main">
          {!activeId ? (
            <p className="muted pad">Start a new conversation to begin.</p>
          ) : (
            <>
              <div className="chat-thread">
                {messages.map((m) => (
                  <div key={m.id} className={`chat-msg ${m.role}`}>
                    <div className="chat-meta">{m.role}</div>
                    <div className="chat-bubble">{m.content}</div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="chat-input">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Reply…"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send();
                  }}
                />
                <button onClick={send} disabled={sending || !draft.trim()}>
                  {sending ? "…" : "Send"}
                </button>
              </div>
            </>
          )}
        </section>

        <aside className="chat-sug">
          <h2 style={{ marginBottom: 12 }}>Suggestions</h2>
          <button className="ghost" onClick={loadSuggestions} disabled={!activeId || busySug} style={{ width: "100%" }}>
            {busySug ? "extracting…" : "Extract from conversation"}
          </button>
          <div style={{ marginTop: 12 }}>
            {suggestions.length === 0 && (
              <p className="muted" style={{ fontSize: 12 }}>
                {activeId ? "Extract once you've answered a few questions." : "Open a chat first."}
              </p>
            )}
            {suggestions.map((s, i) => (
              <div key={i} className="sug">
                <div className="sug-title">{s.name}</div>
                {s.vendor && <div className="muted" style={{ fontSize: 11 }}>{s.vendor}</div>}
                <div className="row-kw">{s.keywords.join(", ")}</div>
                {s.rationale && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{s.rationale}</div>}
                <button onClick={() => applySuggestion(s)} style={{ marginTop: 8, padding: "5px 10px", fontSize: 11 }}>
                  Add as monitored system
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </main>
  );
}
