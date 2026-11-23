import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest } = require("next/server");
const modules = {
  "@/lib/server/topup-packages": "lib/server/topup-packages.ts",
  "@/lib/server/notifications": "lib/server/notifications.ts",
  "@/lib/server/wallet-topup": "lib/server/wallet-topup.ts",
  "@/lib/server/reader-mutation": "lib/server/reader-mutation.ts",
  createRoute: "app/api/wallet/topup/route.ts",
  statusRoute: "app/api/wallet/topup/[code]/route.ts",
  webhookRoute: "app/api/payments/sepay-webhook/route.ts",
};

const compiled = new Map(await Promise.all(Object.entries(modules).map(async ([name, file]) => {
  const source = await readFile(new URL(`../${file}`, import.meta.url), "utf8");
  return [name, ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText];
})));

function harness() {
  let currentUserId = 7;
  let nextOrderId = 1;
  const orders = new Map();
  const wallets = new Map();
  const ledger = [];
  const notifications = [];
  const transactionOptions = [];
  let failNextLedger = false;
  let transactionTail = Promise.resolve();

  const hoaDonNap = {
    async create({ data }) {
      if ([...orders.values()].some((order) => order.maGiaoDich === data.maGiaoDich)) {
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      }
      const order = {
        idHoaDonNap: nextOrderId++,
        createdAt: new Date("2026-11-23T03:00:00.000Z"),
        ngay_xac_nhan: null,
        ...data,
      };
      orders.set(order.idHoaDonNap, order);
      return order;
    },
    async findFirst({ where }) {
      return [...orders.values()].find((order) =>
        order.idTaiKhoan === where.idTaiKhoan && order.maGiaoDich === where.maGiaoDich,
      ) ?? null;
    },
    async findUnique({ where }) {
      return [...orders.values()].find((order) => order.maGiaoDich === where.maGiaoDich) ?? null;
    },
    async updateMany({ where, data }) {
      const order = orders.get(where.idHoaDonNap);
      if (!order || order.trang_thai !== where.trang_thai ||
          (where.soTienVnd !== undefined && Number(order.soTienVnd) !== Number(where.soTienVnd))) {
        return { count: 0 };
      }
      Object.assign(order, data);
      return { count: 1 };
    },
  };
  const tx = {
    hoaDonNap,
    async $executeRaw(_strings, ...values) {
      const accountId = values[0];
      if (!wallets.has(accountId)) wallets.set(accountId, { balance: 0, totalTopUp: 0 });
      return 1;
    },
    async $queryRaw(_strings, ...values) {
      const wallet = wallets.get(values[0]);
      return wallet ? [{ balance: wallet.balance, totalTopUp: wallet.totalTopUp }] : [];
    },
    viTien: {
      async update({ where, data }) {
        wallets.set(where.idTaiKhoan, { balance: data.soDuXu, totalTopUp: data.tongNapXu });
        return { idTaiKhoan: where.idTaiKhoan };
      },
    },
    lichSuGiaoDich: {
      async create({ data }) {
        if (failNextLedger) {
          failNextLedger = false;
          throw new Error("Injected ledger failure");
        }
        ledger.push(data);
        return { idLichSuGiaoDich: ledger.length };
      },
    },
    taiKhoan: {
      async findUniqueOrThrow({ where }) {
        return { tenTaiKhoan: `reader-${where.idTaiKhoan}` };
      },
      async findMany() {
        return [{ idTaiKhoan: 1 }];
      },
    },
    thongBao: {
      async createMany({ data }) {
        notifications.push(...data);
        return { count: data.length };
      },
      async create({ data }) {
        notifications.push(data);
        return { idThongBao: notifications.length };
      },
    },
  };
  const prisma = {
    hoaDonNap,
    async $transaction(callback, options) {
      transactionOptions.push(options);
      let release;
      const previous = transactionTail;
      transactionTail = new Promise((resolve) => { release = resolve; });
      await previous;
      const orderSnapshot = structuredClone(orders);
      const walletSnapshot = structuredClone(wallets);
      const ledgerSnapshot = structuredClone(ledger);
      const notificationSnapshot = structuredClone(notifications);
      try {
        return await callback(tx);
      } catch (error) {
        orders.clear();
        for (const [id, order] of orderSnapshot) orders.set(id, order);
        wallets.clear();
        for (const [id, wallet] of walletSnapshot) wallets.set(id, wallet);
        ledger.splice(0, ledger.length, ...ledgerSnapshot);
        notifications.splice(0, notifications.length, ...notificationSnapshot);
        throw error;
      } finally {
        release();
      }
    },
  };

  const cache = new Map();
  const environment = {
    NODE_ENV: "test",
    SEPAY_BANK_CODE: "MB",
    SEPAY_ACCOUNT_NUMBER: "0123456789",
    SEPAY_ACCOUNT_NAME: "NGUYEN VAN H",
    SEPAY_WEBHOOK_API_KEY: "webhook-secret",
  };
  function load(name) {
    if (name === "server-only") return {};
    if (name === "@/lib/prisma") return { prisma };
    if (name === "@/lib/server/auth-session") {
      return {
        requireUser: async () => ({ authorized: true, user: { idTaiKhoan: currentUserId } }),
      };
    }
    if (!compiled.has(name)) return require(name);
    if (cache.has(name)) return cache.get(name).exports;

    const current = { exports: {} };
    cache.set(name, current);
    vm.runInNewContext(compiled.get(name), {
      module: current,
      exports: current.exports,
      require: load,
      Buffer,
      URL,
      process: { env: environment },
      console: { error() {} },
    }, { filename: modules[name] });
    return current.exports;
  }

  const create = load("createRoute").POST;
  const status = load("statusRoute").GET;
  const webhook = load("webhookRoute").POST;
  const packages = load("@/lib/server/topup-packages");

  return {
    state: { orders, wallets, ledger, notifications, transactionOptions },
    packages,
    failLedgerOnce() { failNextLedger = true; },
    setUser(idTaiKhoan) { currentUserId = idTaiKhoan; },
    async create(body) {
      const response = await create(new NextRequest("https://webnovel.example/api/wallet/topup", {
        method: "POST",
        headers: { origin: "https://webnovel.example", "content-type": "application/json" },
        body: JSON.stringify(body),
      }));
      return { response, body: await response.json() };
    },
    async getStatus(code) {
      const response = await status(new NextRequest(`https://webnovel.example/api/wallet/topup/${code}`), {
        params: Promise.resolve({ code }),
      });
      return { response, body: await response.json() };
    },
    async sendWebhook(body, authorization = "Apikey webhook-secret") {
      const response = await webhook(new NextRequest("https://webnovel.example/api/payments/sepay-webhook", {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({
          id: "sepay-transaction-1",
          accountNumber: "0123456789",
          transferType: "in",
          ...body,
        }),
      }));
      return { response, body: await response.json() };
    },
  };
}

test("top-up packages are server-owned, complete and Zod validated", () => {
  const app = harness();
  assert.deepEqual(Object.keys(app.packages.topUpPackages), [
    "starter_10k", "basic_20k", "popular_50k", "value_100k", "vip_200k", "master_500k",
  ]);
  assert.equal(app.packages.topUpPackages.popular_50k.totalCoins, 550);
  assert.equal(app.packages.topUpPackages.master_500k.bonusCoins, 1_250);
  assert.equal(app.packages.topUpRequestSchema.safeParse({ packageId: "starter_10k", amountVnd: 1 }).success, false);
});

test("creates a pending bank order and returns SePay QR details", async () => {
  const app = harness();
  const result = await app.create({ packageId: "value_100k" });
  assert.equal(result.response.status, 201);
  assert.match(result.body.data.code, /^NVH\d{6}$/);
  assert.equal(result.body.data.status, "PENDING");
  assert.equal(result.body.data.package.totalCoins, 1_150);
  assert.equal(result.body.data.bank.amountVnd, 100_000);
  assert.equal(result.body.data.bank.transferContent, result.body.data.code);
  assert.match(result.body.data.bank.qrUrl, /^https:\/\/qr\.sepay\.vn\/img\?/);
  assert.equal([...app.state.orders.values()][0].trang_thai, "pending");
  assert.equal(app.state.notifications.length, 1);
  assert.match(app.state.notifications[0].tieu_de, /Yêu cầu nạp xu mới/);
});

test("status lookup is scoped to the authenticated account", async () => {
  const app = harness();
  const created = await app.create({ packageId: "starter_10k" });
  assert.equal((await app.getStatus(created.body.data.code)).body.data.status, "PENDING");
  app.setUser(99);
  assert.equal((await app.getStatus(created.body.data.code)).response.status, 404);
});

test("webhook rejects an invalid API key before processing the payment", async () => {
  const app = harness();
  const created = await app.create({ packageId: "popular_50k" });
  const code = created.body.data.code;

  const result = await app.sendWebhook({ content: `Thanh toan ${code}`, transferAmount: 50_000 }, "wrong");

  assert.equal(result.response.status, 401);
  assert.equal(result.body.success, false);
  assert.equal(app.state.wallets.size, 0);
  assert.equal(app.state.ledger.length, 0);
  assert.equal([...app.state.orders.values()][0].trang_thai, "pending");
});

test("webhook only processes incoming transfers for the configured bank account", async () => {
  const app = harness();
  const created = await app.create({ packageId: "popular_50k" });
  const code = created.body.data.code;

  const outgoing = await app.sendWebhook({ code, transferAmount: 50_000, transferType: "out" });
  const wrongAccount = await app.sendWebhook({ code, transferAmount: 50_000, accountNumber: "9999999999" });
  const missingType = await app.sendWebhook({ code, transferAmount: 50_000, transferType: undefined });

  assert.equal(outgoing.body.processed, false);
  assert.equal(wrongAccount.body.processed, false);
  assert.equal(missingType.response.status, 400);
  assert.equal(app.state.wallets.size, 0);
  assert.equal(app.state.ledger.length, 0);
  assert.equal([...app.state.orders.values()][0].trang_thai, "pending");
});

test("webhook rejects a mismatched transfer amount without claiming the order", async () => {
  const app = harness();
  const created = await app.create({ packageId: "popular_50k" });
  const result = await app.sendWebhook({ code: created.body.data.code, transferAmount: 20_000 });

  assert.equal(result.response.status, 409);
  assert.equal(app.state.wallets.size, 0);
  assert.equal(app.state.ledger.length, 0);
  assert.equal([...app.state.orders.values()][0].trang_thai, "pending");
});

test("webhook credits the authenticated account for a matching pending order", async () => {
  const app = harness();
  const created = await app.create({ packageId: "popular_50k" });
  const code = created.body.data.code;

  const result = await app.sendWebhook({ content: `NAP XU ${code}`, transferAmount: 50_000, transferType: "in" });

  assert.equal(result.response.status, 200);
  assert.equal(result.body.processed, true);
  assert.equal(result.body.data.creditedCoins, 550);
  assert.equal(result.body.data.balance, 550);
  assert.deepEqual(app.state.wallets.get(7), { balance: 550, totalTopUp: 550 });
  assert.equal(app.state.ledger.length, 1);
  assert.equal(app.state.ledger[0].so_xu_thay_doi, 550);
  assert.equal(app.state.ledger[0].id_doi_tuong, 1);
  assert.equal([...app.state.orders.values()][0].trang_thai, "success");
  assert.equal(app.state.notifications.length, 2);
  assert.equal(app.state.notifications[1].idTaiKhoan, 7);
  assert.equal(app.state.notifications[1].tieu_de, "Nạp xu thành công");
});

test("webhook processes the same payment twice but credits the wallet only once", async () => {
  const app = harness();
  const created = await app.create({ packageId: "popular_50k" });
  const code = created.body.data.code;

  const [first, duplicate] = await Promise.all([
    app.sendWebhook({ content: `NAP XU ${code}`, transferAmount: 50_000, transferType: "in" }),
    app.sendWebhook({ code, transferAmount: 50_000, transferType: "in" }),
  ]);
  assert.deepEqual([first.body.processed, duplicate.body.processed].sort(), [false, true]);
  assert.deepEqual(app.state.wallets.get(7), { balance: 550, totalTopUp: 550 });
  assert.equal(app.state.ledger.length, 1);
  assert.equal(app.state.ledger[0].so_xu_thay_doi, 550);
  assert.equal(app.state.ledger[0].id_doi_tuong, 1);
  assert.equal([...app.state.orders.values()][0].trang_thai, "success");
  assert.ok(app.state.transactionOptions.every((options) => options === undefined));
});

test("a ledger failure rolls back the order claim and wallet credit", async () => {
  const app = harness();
  const created = await app.create({ packageId: "popular_50k" });
  const code = created.body.data.code;
  app.failLedgerOnce();

  const failed = await app.sendWebhook({ code, transferAmount: 50_000 });
  assert.equal(failed.response.status, 500);
  assert.equal([...app.state.orders.values()][0].trang_thai, "pending");
  assert.equal(app.state.wallets.size, 0);
  assert.equal(app.state.ledger.length, 0);

  const retried = await app.sendWebhook({ code, transferAmount: 50_000 });
  assert.equal(retried.body.processed, true);
  assert.deepEqual(app.state.wallets.get(7), { balance: 550, totalTopUp: 550 });
  assert.equal(app.state.ledger.length, 1);
});
