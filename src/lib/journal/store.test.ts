import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import matter from "gray-matter";
import {
  createEntry,
  deleteEntry,
  getEntry,
  listEntries,
  updateEntry,
} from "./store";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "journal-test-"));
  process.env.JOURNAL_DIR = tmpDir;
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  delete process.env.JOURNAL_DIR;
});

describe("createEntry", () => {
  it("writes a markdown file under YYYY/MM with frontmatter", () => {
    const date = new Date("2026-07-06T15:53:00");
    const entry = createEntry({
      content: "Today I started building Second Brain.",
      tags: ["build", "start"],
      date,
    });

    expect(entry.id).toBe("2026-07-06-1553");
    const filePath = path.join(tmpDir, "2026", "07", "2026-07-06-1553.md");
    expect(fs.existsSync(filePath)).toBe(true);

    const parsed = matter(fs.readFileSync(filePath, "utf-8"));
    expect(parsed.content.trim()).toBe(
      "Today I started building Second Brain."
    );
    expect(parsed.data.source).toBe("web");
    expect(parsed.data.tags).toEqual(["build", "start"]);
    expect(new Date(parsed.data.date).getTime()).toBe(date.getTime());
  });

  it("does not collide when two entries land in the same minute", () => {
    const date = new Date("2026-07-06T15:53:00");
    const first = createEntry({ content: "first", tags: [], date });
    const second = createEntry({ content: "second", tags: [], date });

    expect(first.id).not.toBe(second.id);
    expect(getEntry(first.id)?.content).toBe("first");
    expect(getEntry(second.id)?.content).toBe("second");
  });
});

describe("getEntry", () => {
  it("returns null for a missing entry", () => {
    expect(getEntry("2020-01-01-0000")).toBeNull();
  });

  it("round-trips an entry", () => {
    const created = createEntry({
      content: "hello journal",
      tags: ["a"],
      date: new Date("2026-03-01T09:15:00"),
    });
    const fetched = getEntry(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.content).toBe("hello journal");
    expect(fetched!.tags).toEqual(["a"]);
    expect(fetched!.source).toBe("web");
  });

  it("rejects ids that try to escape the journal dir", () => {
    expect(getEntry("../../etc/passwd")).toBeNull();
  });
});

describe("updateEntry", () => {
  it("replaces content and tags but preserves date and source", () => {
    const created = createEntry({
      content: "draft",
      tags: ["draft"],
      date: new Date("2026-05-10T20:00:00"),
    });
    const updated = updateEntry(created.id, {
      content: "final thoughts",
      tags: ["done"],
    });
    expect(updated.content).toBe("final thoughts");
    expect(updated.tags).toEqual(["done"]);
    expect(updated.date).toBe(created.date);
    expect(updated.source).toBe(created.source);
  });

  it("throws for a missing entry", () => {
    expect(() =>
      updateEntry("2020-01-01-0000", { content: "x", tags: [] })
    ).toThrow();
  });
});

describe("deleteEntry", () => {
  it("removes the file", () => {
    const created = createEntry({
      content: "bye",
      tags: [],
      date: new Date("2026-05-10T20:00:00"),
    });
    deleteEntry(created.id);
    expect(getEntry(created.id)).toBeNull();
  });
});

describe("listEntries", () => {
  it("returns entries sorted newest first across months", () => {
    createEntry({
      content: "march entry",
      tags: [],
      date: new Date("2026-03-05T08:00:00"),
    });
    createEntry({
      content: "july entry",
      tags: [],
      date: new Date("2026-07-01T08:00:00"),
    });
    createEntry({
      content: "january entry",
      tags: [],
      date: new Date("2026-01-20T08:00:00"),
    });

    const entries = listEntries();
    expect(entries.map((e) => e.content)).toEqual([
      "july entry",
      "march entry",
      "january entry",
    ]);
  });

  it("returns an empty list for an empty journal", () => {
    expect(listEntries()).toEqual([]);
  });
});
