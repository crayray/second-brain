import path from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { getConfig } from "@/lib/config";
import type { Chunk } from "./chunk";

const TABLE_NAME = "chunks";

export interface SearchResult extends Chunk {
  distance: number;
}

async function connect(): Promise<lancedb.Connection> {
  return lancedb.connect(path.join(getConfig().dataDir, "lancedb"));
}

async function openTable(): Promise<lancedb.Table | null> {
  const db = await connect();
  const names = await db.tableNames();
  if (!names.includes(TABLE_NAME)) return null;
  return db.openTable(TABLE_NAME);
}

function toRows(chunks: Chunk[], vectors: number[][], mtimeMs: number) {
  return chunks.map((chunk, i) => ({
    id: chunk.id,
    entryId: chunk.entryId,
    path: chunk.path,
    date: chunk.date,
    chunkIndex: chunk.chunkIndex,
    text: chunk.text,
    mtimeMs,
    vector: vectors[i],
  }));
}

export async function upsertEntryChunks(
  entryId: string,
  chunks: Chunk[],
  vectors: number[][],
  mtimeMs: number
): Promise<void> {
  const rows = toRows(chunks, vectors, mtimeMs);
  const table = await openTable();
  if (!table) {
    if (rows.length === 0) return;
    const db = await connect();
    await db.createTable(TABLE_NAME, rows);
    return;
  }
  await table.delete(`\`entryId\` = '${entryId}'`);
  if (rows.length > 0) await table.add(rows);
}

export async function deleteEntryChunks(entryId: string): Promise<void> {
  const table = await openTable();
  if (!table) return;
  await table.delete(`\`entryId\` = '${entryId}'`);
}

export async function searchChunks(
  vector: number[],
  k: number,
  dateRange?: { from?: string; to?: string }
): Promise<SearchResult[]> {
  const table = await openTable();
  if (!table) return [];

  let query = table.query().nearestTo(vector).limit(k);
  const conditions: string[] = [];
  if (dateRange?.from) conditions.push(`\`date\` >= '${dateRange.from}'`);
  if (dateRange?.to) conditions.push(`\`date\` <= '${dateRange.to}'`);
  if (conditions.length > 0) query = query.where(conditions.join(" AND "));

  const rows = (await query.toArray()) as Array<
    Chunk & { _distance: number }
  >;
  return rows.map((row) => ({
    id: row.id,
    entryId: row.entryId,
    path: row.path,
    date: row.date,
    chunkIndex: row.chunkIndex,
    text: row.text,
    distance: row._distance,
  }));
}

/** Map of entryId -> indexed mtimeMs, for staleness checks on startup. */
export async function getIndexedEntries(): Promise<Map<string, number>> {
  const table = await openTable();
  if (!table) return new Map();
  const rows = (await table
    .query()
    .select(["entryId", "mtimeMs"])
    .toArray()) as Array<{ entryId: string; mtimeMs: number }>;
  const map = new Map<string, number>();
  for (const row of rows) map.set(row.entryId, row.mtimeMs);
  return map;
}

export async function dropIndex(): Promise<void> {
  const db = await connect();
  const names = await db.tableNames();
  if (names.includes(TABLE_NAME)) await db.dropTable(TABLE_NAME);
}
