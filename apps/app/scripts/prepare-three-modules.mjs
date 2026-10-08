import { cp, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Publish the locked npm package as browser-native ES modules. Next serves
// public/ in dev and production; Docker already copies it to the runner.
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(join(appRoot, "package.json"));
const packageRoot = resolve(dirname(require.resolve("three")), "..");
const pkg = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const app = JSON.parse(await readFile(join(appRoot, "package.json"), "utf8"));
if (app.dependencies.three !== pkg.version) {
  throw new Error("Three.js must use an exact installed version; run pnpm install.");
}
const destination = join(appRoot, "public", "resources", "libs", "three", pkg.version);
await mkdir(destination, { recursive: true });
for (const directory of ["build", "examples/jsm", "src"]) {
  await cp(join(packageRoot, directory), join(destination, directory), { recursive: true });
}
await cp(join(packageRoot, "LICENSE"), join(destination, "LICENSE"));
console.log(`Prepared local Three.js ${pkg.version} modules.`);
