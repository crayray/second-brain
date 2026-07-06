import { getConfig } from "@/lib/config";
import { rebuildIndex } from "@/lib/rag/indexer";

async function main() {
  const { journalDir } = getConfig();
  console.log(`Rebuilding index from ${journalDir} ...`);
  const count = await rebuildIndex();
  console.log(`Done. Indexed ${count} entries.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
