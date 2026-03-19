import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

process.env.NODE_ENV = "production";
process.env.HOSTNAME = "0.0.0.0";

const serverPath = path.join(process.cwd(), ".next", "standalone", "server.js");

if (!fs.existsSync(serverPath)) {
  console.error(`Standalone server not found at ${serverPath}`);
  process.exit(1);
}

const require = createRequire(import.meta.url);
require(serverPath);
