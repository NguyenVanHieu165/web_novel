import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const root = new URL("../socket-server/", import.meta.url);

test("Docker build stage includes every transitive local module of server and worker", async () => {
  const dockerfile = await readFile(new URL("Dockerfile", root), "utf8");
  const copied = new Map();
  async function copy(source, destination) {
    const entry = new URL(source, root);
    if ((await stat(entry)).isDirectory()) {
      for (const child of await readdir(entry)) await copy(`${source}/${child}`, path.posix.join(destination, child));
    } else {
      copied.set(path.posix.normalize(destination), source);
    }
  }
  let stage = -1;
  for (const line of dockerfile.split(/\r?\n/u).map(value => value.trim())) {
    if (/^FROM\s/iu.test(line)) stage++;
    if (stage !== 0 || !/^COPY\s/iu.test(line)) continue;
    const parts = line.split(/\s+/u).slice(1);
    assert.ok(!parts.some(value => value.startsWith("--")), "review COPY options in the source reachability harness");
    const destination = parts.pop();
    for (const source of parts) {
      const directory = (await stat(new URL(source, root))).isDirectory();
      await copy(source, directory ? destination : path.posix.join(destination, path.posix.basename(source)));
    }
  }
  const pending = ["server.ts", "worker.ts"], seen = new Set(), missing = [];
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    assert.ok(copied.has(file), `${file} must be in the build context`);
    const source = await readFile(new URL(copied.get(file), root), "utf8");
    for (const imported of ts.preProcessFile(source, true, true).importedFiles) {
      if (!imported.fileName.startsWith(".")) continue;
      const modulePath = path.posix.normalize(path.posix.join(path.posix.dirname(file), imported.fileName)).replace(/\.js$/u, "");
      const resolved = [modulePath, `${modulePath}.ts`, `${modulePath}/index.ts`].find(candidate => copied.has(candidate));
      if (resolved) pending.push(resolved);
      else missing.push(`${file} -> ${imported.fileName}`);
    }
  }
  assert.deepEqual(missing, [], `Docker COPY omits reachable modules: ${missing.join(", ")}`);
  assert.ok(seen.size > 20, "walk both entry points through their real dependencies");
});
