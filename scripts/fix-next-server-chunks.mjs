import fs from "node:fs/promises";
import path from "node:path";

const projectRoot = process.cwd();
const serverDir = path.join(projectRoot, ".next", "server");
const chunksDir = path.join(serverDir, "chunks");

async function main() {
  try {
    const chunkEntries = await fs.readdir(chunksDir, { withFileTypes: true });
    const jsFiles = chunkEntries.filter((entry) => entry.isFile() && entry.name.endsWith(".js"));

    await Promise.all(
      jsFiles.map(async (entry) => {
        const source = path.join(chunksDir, entry.name);
        const target = path.join(serverDir, entry.name);
        await fs.copyFile(source, target);
      }),
    );

    console.log(`Copied ${jsFiles.length} server chunks to ${serverDir}`);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      console.log("No server chunks directory found, skipping chunk fix.");
      return;
    }

    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
