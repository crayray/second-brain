import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getEntry } from "@/lib/journal/store";
import { DeleteEntryButton } from "./delete-button";

export const dynamic = "force-dynamic";

export default async function EntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const entry = getEntry(id);
  if (!entry) notFound();

  return (
    <article>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <time className="text-lg font-semibold">
            {new Date(entry.date).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          <p className="text-sm text-neutral-500">
            {new Date(entry.date).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
            {entry.tags.length > 0 && <> · {entry.tags.join(", ")}</>}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/write?id=${entry.id}`}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-sm hover:border-black/30 dark:border-white/10 dark:hover:border-white/30 transition-colors"
          >
            Edit
          </Link>
          <DeleteEntryButton id={entry.id} />
        </div>
      </header>
      <div className="prose prose-neutral dark:prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {entry.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
