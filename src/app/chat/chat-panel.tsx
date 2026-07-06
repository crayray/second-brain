"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Citation {
  entryId: string;
  date: string;
  excerpt: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

export function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const question = input.trim();
    if (question === "" || busy) return;
    setError(null);
    setInput("");
    setBusy(true);

    const history = [...messages, { role: "user" as const, content: question }];
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const patchAssistant = (patch: (m: Message) => Message) =>
        setMessages((current) => [
          ...current.slice(0, -1),
          patch(current[current.length - 1]),
        ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (line.trim() === "") continue;
          const event = JSON.parse(line);
          if (event.type === "citations") {
            patchAssistant((m) => ({ ...m, citations: event.citations }));
          } else if (event.type === "token") {
            patchAssistant((m) => ({ ...m, content: m.content + event.text }));
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      }
    } catch (err) {
      setError(String(err));
      setMessages((current) =>
        current[current.length - 1]?.content === ""
          ? current.slice(0, -1)
          : current
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <div className="py-24 text-center text-neutral-500">
            <p className="mb-1 font-medium text-foreground">
              Chat with your journal
            </p>
            <p className="text-sm">
              Try &ldquo;What have I been worried about lately?&rdquo;
            </p>
          </div>
        )}
        {messages.map((message, i) =>
          message.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl bg-foreground px-4 py-2.5 text-sm text-background">
                {message.content}
              </div>
            </div>
          ) : (
            <div key={i} className="max-w-[85%]">
              <div className="prose prose-sm prose-neutral dark:prose-invert">
                {message.content === "" && busy && i === messages.length - 1 ? (
                  <p className="animate-pulse text-neutral-400">Thinking…</p>
                ) : (
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                )}
              </div>
              {message.citations && message.citations.length > 0 && (
                <div className="mt-3 space-y-1.5 border-l-2 border-black/10 pl-3 dark:border-white/15">
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                    From your journal
                  </p>
                  {message.citations.map((citation) => (
                    <Link
                      key={citation.entryId}
                      href={`/entries/${citation.entryId}`}
                      className="block text-xs text-neutral-500 hover:text-foreground transition-colors"
                    >
                      <span className="font-medium">
                        {new Date(citation.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>{" "}
                      — {citation.excerpt}…
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )
        )}
        {error && (
          <p className="text-sm text-red-600">Something went wrong: {error}</p>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex gap-2 border-t border-black/10 pt-4 dark:border-white/10"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask your journal anything…"
          autoFocus
          className="flex-1 rounded-xl border border-black/10 bg-transparent px-4 py-2.5 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30 transition-colors"
        />
        <button
          type="submit"
          disabled={busy || input.trim() === ""}
          className="rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background disabled:opacity-40 hover:opacity-85 transition-opacity"
        >
          Send
        </button>
      </form>
    </div>
  );
}
