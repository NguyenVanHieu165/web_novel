import assert from "node:assert/strict";
import test from "node:test";
import axios from "axios";
import { loadNotificationModule as load } from "./notification-support.mjs";

test("intentional request cancellation rejects silently without logging a backend error", async () => {
  const logs = [];
  const client = load("lib/axios.ts", {}, { console: { error: (...args) => logs.push(args) } }).default;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client.get("/admin/chapters", { signal: controller.signal }), (error) => axios.isCancel(error));
  assert.equal(logs.length, 0);
});

test("real HTTP failures still reject and retain backend status and message in diagnostics", async () => {
  const logs = [];
  const client = load("lib/axios.ts", {}, { console: { error: (...args) => logs.push(args) } }).default;
  const failure = new axios.AxiosError("Request failed with status code 500", "ERR_BAD_RESPONSE", undefined, undefined, { status: 500, data: { message: "Không thể tải chương" } });
  await assert.rejects(client.get("/admin/chapters", { adapter: async () => { throw failure; } }), (error) => error === failure);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][1].status, 500);
  assert.equal(logs[0][1].data.message, "Không thể tải chương");
});
