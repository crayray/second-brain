import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { getConfig } from "@/lib/config";

export type EntrySource = "web" | "phone" | "paper";

export interface Entry {
  /** Filename without extension, e.g. "2026-07-06-1553" (or "-2" suffixed). */
  id: string;
  /** Absolute path to the markdown file. */
  path: string;
  /** ISO timestamp from frontmatter. */
  date: string;
  source: EntrySource;
  tags: string[];
  /** Markdown body without frontmatter. */
  content: string;
}

// Also guards against path traversal: ids that don't match never touch the fs.
const ID_PATTERN = /^(\d{4})-(\d{2})-\d{2}-\d{4}(-\d+)?$/;

function filePathForId(id: string): string | null {
  const match = ID_PATTERN.exec(id);
  if (!match) return null;
  const [, year, month] = match;
  return path.join(getConfig().journalDir, year, month, `${id}.md`);
}

function readEntryFile(id: string, filePath: string): Entry {
  const parsed = matter(fs.readFileSync(filePath, "utf-8"));
  const rawDate = parsed.data.date;
  const date =
    rawDate instanceof Date ? rawDate.toISOString() : String(rawDate);
  return {
    id,
    path: filePath,
    date,
    source: (parsed.data.source as EntrySource) ?? "web",
    tags: Array.isArray(parsed.data.tags) ? parsed.data.tags.map(String) : [],
    content: parsed.content.trim(),
  };
}

function writeEntryFile(
  filePath: string,
  content: string,
  data: { date: string; source: EntrySource; tags: string[] }
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, matter.stringify(`${content.trim()}\n`, data));
}

export interface CreateEntryInput {
  content: string;
  tags: string[];
  source?: EntrySource;
  date?: Date;
}

export function createEntry({
  content,
  tags,
  source = "web",
  date = new Date(),
}: CreateEntryInput): Entry {
  const pad = (n: number) => String(n).padStart(2, "0");
  const baseId = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}-${pad(date.getHours())}${pad(date.getMinutes())}`;

  let id = baseId;
  let filePath = filePathForId(id)!;
  for (let n = 2; fs.existsSync(filePath); n++) {
    id = `${baseId}-${n}`;
    filePath = filePathForId(id)!;
  }

  writeEntryFile(filePath, content, {
    date: date.toISOString(),
    source,
    tags,
  });
  return readEntryFile(id, filePath);
}

export function getEntry(id: string): Entry | null {
  const filePath = filePathForId(id);
  if (!filePath || !fs.existsSync(filePath)) return null;
  return readEntryFile(id, filePath);
}

export function updateEntry(
  id: string,
  { content, tags }: { content: string; tags: string[] }
): Entry {
  const existing = getEntry(id);
  if (!existing) throw new Error(`Entry not found: ${id}`);
  writeEntryFile(existing.path, content, {
    date: existing.date,
    source: existing.source,
    tags,
  });
  return readEntryFile(id, existing.path);
}

export function deleteEntry(id: string): void {
  const filePath = filePathForId(id);
  if (!filePath || !fs.existsSync(filePath)) return;
  fs.rmSync(filePath);
}

export function listMarkdownFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      results.push(...listMarkdownFiles(full));
    } else if (dirent.name.endsWith(".md")) {
      results.push(full);
    }
  }
  return results;
}

/** Read any markdown file in the journal folder as an entry (id = filename). */
export function readEntryByPath(filePath: string): Entry | null {
  if (!fs.existsSync(filePath)) return null;
  return readEntryFile(path.basename(filePath, ".md"), filePath);
}

export function listEntries(): Entry[] {
  const { journalDir } = getConfig();
  return listMarkdownFiles(journalDir)
    .map((filePath) => readEntryFile(path.basename(filePath, ".md"), filePath))
    .sort((a, b) => b.date.localeCompare(a.date));
}
