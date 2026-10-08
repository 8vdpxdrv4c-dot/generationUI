import { cp, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(appRoot, ".next", "standalone", "apps", "app");
await mkdir(destination, { recursive: true });
await cp(join(appRoot, "public"), join(destination, "public"), {
  recursive: true,
  filter: (source) => source !== join(appRoot, "public", "upload"),
});
await cp(join(appRoot, ".next", "static"), join(destination, ".next", "static"), { recursive: true });
console.log("Prepared standalone server with static assets.");
