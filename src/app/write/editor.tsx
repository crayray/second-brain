"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function Editor() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!editId);

  useEffect(() => {
    if (!editId) return;
    fetch(`/api/entries/${editId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((entry) => {
        if (entry) {
          setContent(entry.content);
          setTags(entry.tags.join(", "));
        }
        setLoaded(true);
      });
  }, [editId]);

  async function handleSave() {
    if (content.trim() === "" || saving) return;
    setSaving(true);
    const body = {
      content,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };
    const res = await fetch(editId ? `/api/entries/${editId}` : "/api/entries", {
      method: editId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const entry = await res.json();
      router.push(`/entries/${entry.id}`);
      router.refresh();
    } else {
      setSaving(false);
    }
  }

  if (!loaded) {
    return <p className="py-12 text-center text-neutral-500">Loading…</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          {editId ? "Edit entry" : "New entry"}
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPreview((v) => !v)}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm hover:border-black/30 dark:border-white/10 dark:hover:border-white/30 transition-colors"
          >
            {showPreview ? "Edit" : "Preview"}
          </button>
          <button
            onClick={handleSave}
            disabled={content.trim() === "" || saving}
            className="rounded-lg bg-foreground px-4 py-1.5 text-sm font-medium text-background disabled:opacity-40 hover:opacity-85 transition-opacity"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {showPreview ? (
        <div className="prose prose-neutral dark:prose-invert min-h-[50vh] max-w-none rounded-xl border border-black/10 px-5 py-4 dark:border-white/10">
          {content.trim() === "" ? (
            <p className="text-neutral-400">Nothing to preview yet.</p>
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          )}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="What's on your mind?"
          autoFocus
          className="min-h-[50vh] w-full resize-y rounded-xl border border-black/10 bg-transparent px-5 py-4 font-mono text-sm leading-relaxed outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30 transition-colors"
        />
      )}

      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="Tags (comma-separated)"
        className="w-full rounded-xl border border-black/10 bg-transparent px-5 py-2.5 text-sm outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30 transition-colors"
      />
    </div>
  );
}
