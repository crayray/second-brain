import { describe, expect, it } from "vitest";
import {
  filterEntries,
  parseTagsParam,
  uniqueTags,
  type EntryFilters,
} from "./filter";
import type { Entry } from "./store";

function makeEntry(overrides: Partial<Entry>): Entry {
  return {
    id: "2026-01-01-0000",
    path: "/tmp/2026-01-01-0000.md",
    date: "2026-01-01T00:00:00.000Z",
    source: "web",
    tags: [],
    content: "",
    ...overrides,
  };
}

const entries: Entry[] = [
  makeEntry({ id: "a", date: "2026-01-05T10:00:00.000Z", tags: ["work"] }),
  makeEntry({ id: "b", date: "2026-03-15T10:00:00.000Z", tags: ["family", "trip"] }),
  makeEntry({ id: "c", date: "2026-06-20T10:00:00.000Z", tags: ["work", "trip"] }),
  makeEntry({ id: "d", date: "2026-06-25T10:00:00.000Z", tags: [] }),
];

describe("filterEntries", () => {
  it("returns all entries when no filters are given", () => {
    expect(filterEntries(entries, {})).toEqual(entries);
  });

  it("filters entries on or after the from date", () => {
    const result = filterEntries(entries, { from: "2026-03-15" });
    expect(result.map((e) => e.id)).toEqual(["b", "c", "d"]);
  });

  it("filters entries on or before the to date", () => {
    const result = filterEntries(entries, { to: "2026-03-15" });
    expect(result.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("filters entries within an inclusive date range", () => {
    const result = filterEntries(entries, { from: "2026-01-05", to: "2026-06-20" });
    expect(result.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("filters entries matching any of the selected tags", () => {
    const result = filterEntries(entries, { tags: ["family", "work"] });
    expect(result.map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("combines date range and tag filters", () => {
    const result = filterEntries(entries, {
      from: "2026-03-01",
      tags: ["work"],
    });
    expect(result.map((e) => e.id)).toEqual(["c"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterEntries(entries, { tags: ["nonexistent"] })).toEqual([]);
  });

  it("ignores blank from/to/tags filters", () => {
    const filters: EntryFilters = { from: "", to: "", tags: [] };
    expect(filterEntries(entries, filters)).toEqual(entries);
  });
});

describe("uniqueTags", () => {
  it("returns sorted, de-duplicated tags across entries", () => {
    expect(uniqueTags(entries)).toEqual(["family", "trip", "work"]);
  });

  it("returns an empty list when no entries have tags", () => {
    expect(uniqueTags([makeEntry({ tags: [] })])).toEqual([]);
  });
});

describe("parseTagsParam", () => {
  it("splits a comma-separated string into trimmed tags", () => {
    expect(parseTagsParam("work, family,trip")).toEqual([
      "work",
      "family",
      "trip",
    ]);
  });

  it("returns an empty array for undefined or empty input", () => {
    expect(parseTagsParam(undefined)).toEqual([]);
    expect(parseTagsParam("")).toEqual([]);
  });

  it("uses the first value when given an array", () => {
    expect(parseTagsParam(["work,family", "ignored"])).toEqual([
      "work",
      "family",
    ]);
  });
});
