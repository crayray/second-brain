"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { parseTagsParam } from "@/lib/journal/filter";

interface FilterBarProps {
  allTags: string[];
}

export function FilterBar({ allTags }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const selectedTags = parseTagsParam(searchParams.get("tags") ?? undefined);
  const hasActiveFilters = Boolean(from || to || selectedTags.length > 0);

  function updateParams(mutate: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const query = params.toString();
    router.push(query ? `/?${query}` : "/");
  }

  function setDate(key: "from" | "to", value: string) {
    updateParams((params) => {
      if (value) params.set(key, value);
      else params.delete(key);
    });
  }

  function toggleTag(tag: string) {
    updateParams((params) => {
      const nextTags = selectedTags.includes(tag)
        ? selectedTags.filter((t) => t !== tag)
        : [...selectedTags, tag];
      if (nextTags.length > 0) params.set("tags", nextTags.join(","));
      else params.delete("tags");
    });
  }

  return (
    <div className="mb-8 flex flex-col gap-3 rounded-xl border border-black/10 px-5 py-4 dark:border-white/10">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-neutral-500">
          From
          <input
            type="date"
            value={from}
            onChange={(e) => setDate("from", e.target.value)}
            className="rounded-lg border border-black/10 bg-transparent px-2 py-1 text-sm text-foreground outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30 transition-colors"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-500">
          To
          <input
            type="date"
            value={to}
            onChange={(e) => setDate("to", e.target.value)}
            className="rounded-lg border border-black/10 bg-transparent px-2 py-1 text-sm text-foreground outline-none focus:border-black/30 dark:border-white/10 dark:focus:border-white/30 transition-colors"
          />
        </label>
        {hasActiveFilters && (
          <Link
            href="/"
            className="ml-auto text-sm text-neutral-500 hover:text-foreground transition-colors"
          >
            Clear filters
          </Link>
        )}
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((tag) => {
            const checked = selectedTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={checked}
                onClick={() => toggleTag(tag)}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  checked
                    ? "border-foreground bg-foreground text-background"
                    : "border-black/10 text-neutral-600 hover:border-black/30 dark:border-white/10 dark:text-neutral-300 dark:hover:border-white/30"
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
