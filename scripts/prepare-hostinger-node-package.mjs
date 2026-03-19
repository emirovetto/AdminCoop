import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourceStandalone = path.join(root, ".next", "standalone");
const sourceStatic = path.join(root, ".next", "static");
const sourcePublic = path.join(root, "public");
const target = path.join(root, "deploy", "hostinger-node");
const targetStatic = path.join(target, ".next", "static");
const targetPublic = path.join(target, "public");

async function ensureRemoved(targetPath) {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function ensureDir(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

async function copyIfExists(source, destination) {
  try {
    await fs.access(source);
    await fs.cp(source, destination, { recursive: true, force: true });
  } catch {
    // optional source
  }
}

async function main() {
  await ensureRemoved(target);
  await ensureDir(path.dirname(target));
  await fs.cp(sourceStandalone, target, { recursive: true, force: true });
  await ensureDir(path.join(target, ".next"));
  await copyIfExists(sourceStatic, targetStatic);
  await copyIfExists(sourcePublic, targetPublic);

  const readme = `Hostinger Node package listo.

Contenido:
- server.js
- .next
- node_modules minimizado por standalone
- prisma
- public (si existe)

Variables requeridas:
- DATABASE_URL
- AUTH_SECRET
- NEXT_PUBLIC_APP_NAME

Comando de inicio sugerido:
node server.js
`;

  await fs.writeFile(path.join(target, "DEPLOY_README.txt"), readme, "utf8");
  console.log(`Package generado en ${target}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
