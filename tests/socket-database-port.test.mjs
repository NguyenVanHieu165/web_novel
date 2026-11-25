import assert from "node:assert/strict";
import test from "node:test";
import { buildJobPoolOptions } from "../socket-server/jobs/database.ts";

test("database ports use MySQL or TiDB defaults only when no URL or configuration port exists", () => {
  for (const [config, expected] of [
    [{ url: "mysql://reader:fixture@localhost/web_truyen" }, 3306],
    [{ url: "mysql://reader:fixture@gateway.tidbcloud.com/web_truyen" }, 4000],
    [{ url: "mysql://reader:fixture@localhost:3307/web_truyen" }, 3307],
    [{ url: "mysql://reader:fixture@gateway.tidbcloud.com:4001/web_truyen" }, 4001],
    [{ url: "mysql://reader:fixture@localhost:3307/web_truyen", port: 3308 }, 3308],
    [{ host: "localhost", user: "reader", name: "web_truyen" }, 3306],
    [{ host: "gateway.tidbcloud.com", user: "reader", name: "web_truyen" }, 4000],
  ]) assert.equal(buildJobPoolOptions(config).port, expected);
});
