import chokidar, { type FSWatcher } from "chokidar";
import { getConfig } from "@/lib/config";
import { indexFile, removeFileFromIndex, syncIndex } from "./indexer";

// Survive Next.js dev-mode module reloads: keep the watcher on globalThis.
const globalState = globalThis as unknown as {
  __journalWatcher?: FSWatcher;
};

export function startWatcher(): void {
  if (globalState.__journalWatcher) return;

  const { journalDir } = getConfig();

  const watcher = chokidar.watch(journalDir, {
    ignored: (filePath, stats) =>
      Boolean(stats?.isFile() && !filePath.endsWith(".md")),
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  });

  const logError = (action: string) => (error: unknown) =>
    console.error(`[watcher] failed to ${action}:`, error);

  watcher.on("add", (filePath) =>
    indexFile(filePath).catch(logError(`index ${filePath}`))
  );
  watcher.on("change", (filePath) =>
    indexFile(filePath).catch(logError(`reindex ${filePath}`))
  );
  watcher.on("unlink", (filePath) =>
    removeFileFromIndex(filePath).catch(logError(`remove ${filePath}`))
  );

  globalState.__journalWatcher = watcher;
  console.log(`[watcher] watching ${journalDir}`);

  // Catch up on anything that changed while the app was not running.
  syncIndex()
    .then(() => console.log("[watcher] initial index sync complete"))
    .catch(logError("run initial sync"));
}
