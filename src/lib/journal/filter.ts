import type { Entry } from "./store";

export interface EntryFilters {
  /** Inclusive lower bound, as a "YYYY-MM-DD" date string. */
  from?: string;
  /** Inclusive upper bound, as a "YYYY-MM-DD" date string. */
  to?: string;
  /** Entries matching any of these tags are kept. */
  tags?: string[];
}

export function filterEntries(entries: Entry[], filters: EntryFilters): Entry[] {
  const from = filters.from?.trim();
  const to = filters.to?.trim();
  const tags = (filters.tags ?? []).filter(Boolean);

  return entries.filter((entry) => {
    const entryDate = entry.date.slice(0, 10);
    if (from && entryDate < from) return false;
    if (to && entryDate > to) return false;
    if (tags.length > 0 && !tags.some((tag) => entry.tags.includes(tag))) {
      return false;
    }
    return true;
  });
}

/** Tags are encoded in the URL as a single comma-separated "tags" param. */
export function parseTagsParam(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return [];
  return raw
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function uniqueTags(entries: Entry[]): string[] {
  const tags = new Set<string>();
  for (const entry of entries) {
    for (const tag of entry.tags) tags.add(tag);
  }
  return [...tags].sort();
}
