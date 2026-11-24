import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const sourceRoots = ["app", "components", "lib", "schemas"];
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return sourceExtensions.has(path.extname(entry.name)) ? [target] : [];
  }));
  return files.flat();
}

test("Vercel source never imports the ignored socket-server runtime", async () => {
  const vercelIgnore = await readFile(".vercelignore", "utf8");
  assert.match(vercelIgnore, /^\/socket-server\/$/mu);

  const violations = [];
  for (const file of (await Promise.all(sourceRoots.map(sourceFiles))).flat()) {
    const source = await readFile(file, "utf8");
    if (/(?:\bfrom\s+|\bimport\s*\()\s*["'][^"']*socket-server\//u.test(source)) {
      violations.push(file.replaceAll("\\", "/"));
    }
  }

  assert.deepEqual(violations, []);
});
