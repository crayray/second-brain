import Link from "next/link";
import { listEntries, type Entry } from "@/lib/journal/store";
import { filterEntries, parseTagsParam, uniqueTags } from "@/lib/journal/filter";
import { FilterBar } from "./filter-bar";

export const dynamic = "force-dynamic";

function toStringParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function monthLabel(date: string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function excerpt(content: string, max = 140): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const allEntries = listEntries();

  if (allEntries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <p className="text-neutral-500">No entries yet.</p>
        <Link
          href="/write"
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-85 transition-opacity"
        >
          Write your first entry
        </Link>
      </div>
    );
  }

  const from = toStringParam(params.from);
  const to = toStringParam(params.to);
  const tags = parseTagsParam(params.tags);
  const entries = filterEntries(allEntries, { from, to, tags });

  const byMonth = new Map<string, Entry[]>();
  for (const entry of entries) {
    const label = monthLabel(entry.date);
    if (!byMonth.has(label)) byMonth.set(label, []);
    byMonth.get(label)!.push(entry);
  }

  return (
    <div>
      <FilterBar allTags={uniqueTags(allEntries)} />
      {entries.length === 0 ? (
        <p className="py-12 text-center text-neutral-500">
          No entries match these filters.
        </p>
      ) : (
        <div className="space-y-10">
          {[...byMonth.entries()].map(([label, monthEntries]) => (
            <section key={label}>
              <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-neutral-500">
                {label}
              </h2>
              <ul className="space-y-3">
                {monthEntries.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={`/entries/${entry.id}`}
                      className="block rounded-xl border border-black/10 px-5 py-4 transition-colors hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
                    >
                      <div className="mb-1 flex items-baseline justify-between gap-4">
                        <time className="text-sm font-medium">
                          {new Date(entry.date).toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          })}
                          <span className="ml-2 font-normal text-neutral-500">
                            {new Date(entry.date).toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </span>
                        </time>
                        {entry.tags.length > 0 && (
                          <span className="flex flex-wrap gap-1.5">
                            {entry.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-black/5 px-2 py-0.5 text-xs text-neutral-600 dark:bg-white/10 dark:text-neutral-300"
                              >
                                {tag}
                              </span>
                            ))}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-600 dark:text-neutral-400">
                        {excerpt(entry.content)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
