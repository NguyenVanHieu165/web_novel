import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const definitions = [
  ["realtime", path.join(directory, "dist", "server.js")],
  ...(process.env.WORKER_ENABLED === "false" ? [] : [["worker", path.join(directory, "dist", "worker.js")]]),
];
const children = new Map();
let shuttingDown = false;
let requestedExitCode = 0;

for (const [name, entry] of definitions) {
  const child = spawn(process.execPath, [entry], { cwd: directory, env: process.env, stdio: "inherit" });
  children.set(name, child);
  child.once("exit", (code, signal) => {
    children.delete(name);
    if (!shuttingDown) {
      console.error(`[supervisor] ${name} exited unexpectedly`, { code, signal });
      requestedExitCode = code && code > 0 ? code : 1;
      shutdown("SIGTERM");
    } else if (children.size === 0) {
      process.exit(requestedExitCode);
    }
  });
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) child.kill(signal);
  const force = setTimeout(() => {
    requestedExitCode ||= 1;
    for (const child of children.values()) child.kill("SIGKILL");
  }, 15_000);
  force.unref();
  if (children.size === 0) process.exit(requestedExitCode);
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
