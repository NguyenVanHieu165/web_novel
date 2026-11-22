import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server");
const routeSource = await readFile(
  new URL("../app/api/chapters/[id]/purchase/route.ts", import.meta.url),
  "utf8",
);
const awaitRevenueSource = await readFile(new URL("../lib/server/chapter-revenue.ts", import.meta.url), "utf8");
const compiledRoute = ts.transpileModule(routeSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// The transaction double tests handler decisions and rollback behavior without touching
// real accounts. Its serialized transactions do NOT verify MySQL locks/isolation.
export function harness({
  balance = 30,
  price = 10,
  authorized = true,
  roles = ["user"],
  available = true,
  free = false,
  failLedger = false,
  missingWallet = false,
  bigintResults = false,
  contentReady = 1,
  authorId = null,
  authorBalance = 0,
  failAuthorLedger = false,
} = {}) {
  let state = {
    wallets: new Map(missingWallet ? [] : [[7, balance], [99, 1000]]),
    purchases: new Set(),
    ledger: [],
  };
  if (authorId && authorId !== 7) state.wallets.set(authorId, authorBalance);
  const walletLocks = [];
  const chapters = new Map([
    [11, { idChuong: 11, idTruyen: 1, isFree: free, giaXu: price, contentReady }],
    [12, { idChuong: 12, idTruyen: 1, isFree: free, giaXu: price, contentReady }],
  ]);
  let transactionCount = 0;
  let pendingTransaction = Promise.resolve();
  const queryPurchase = ({ where }) => {
    const { idTaiKhoan, idChuong } = where.idTaiKhoan_idChuong;
    return state.purchases.has(`${idTaiKhoan}:${idChuong}`) ? { idChuong } : null;
  };
  const queryWallet = ({ where }) => state.wallets.has(where.idTaiKhoan)
    ? { soDuXu: state.wallets.get(where.idTaiKhoan) }
    : null;

  const tx = {
    async $queryRaw(strings, ...values) {
      const sql = strings.join("?");
      if (/FROM\s+chuong\b/i.test(sql)) {
        const chapter = available ? chapters.get(values[0]) : null;
        return chapter ? [{
          ...chapter,
          isFree: chapter.isFree === null ? null : Number(chapter.isFree),
          giaXu: bigintResults && chapter.giaXu !== null ? BigInt(chapter.giaXu) : chapter.giaXu,
          contentReady: bigintResults ? BigInt(chapter.contentReady) : chapter.contentReady,
        }] : [];
      }
      if (/FROM\s+vi_tien\b/i.test(sql)) {
        walletLocks.push(values[0]);
        const currentBalance = state.wallets.get(values[0]);
        return currentBalance === undefined ? [] : [{
          balance: bigintResults ? BigInt(currentBalance) : currentBalance,
        }];
      }
      throw new Error(`Unexpected query in transaction double: ${sql}`);
    },
    async $executeRaw(_strings, amount, accountId, minimumBalance) {
      const currentBalance = state.wallets.get(accountId);
      if (currentBalance === undefined || currentBalance < minimumBalance) return 0;
      state.wallets.set(accountId, currentBalance - amount);
      return 1;
    },
    viTien: {
      async upsert({ where, create }) {
        if (!state.wallets.has(where.idTaiKhoan)) state.wallets.set(where.idTaiKhoan, create.soDuXu);
        return { idTaiKhoan: where.idTaiKhoan };
      },
      async update({ where, data }) { state.wallets.set(where.idTaiKhoan, data.soDuXu); return { idTaiKhoan: where.idTaiKhoan }; },
    },
    chuongDaMua: {
      async findUnique(query) { return queryPurchase(query); },
      async create({ data }) {
        const key = `${data.idTaiKhoan}:${data.idChuong}`;
        if (state.purchases.has(key)) throw Object.assign(new Error("Duplicate purchase"), { code: "P2002" });
        state.purchases.add(key);
        return data;
      },
    },
    lichSuGiaoDich: {
      async create({ data }) {
        if (failLedger || (failAuthorLedger && data.so_xu_thay_doi > 0)) throw new Error("Simulated ledger failure");
        state.ledger.push({ ...data });
        return data;
      },
    },
  };
  const prisma = {
    async $transaction(callback) {
      const previous = pendingTransaction;
      let release;
      pendingTransaction = new Promise((resolve) => { release = resolve; });
      await previous;
      transactionCount += 1;
      const snapshot = structuredClone(state);
      try {
        return await callback(tx);
      } catch (error) {
        state = snapshot;
        throw error;
      } finally {
        release();
      }
    },
    viTien: { async findUnique(query) { return queryWallet(query); } },
    chuongDaMua: { async findUnique(query) { return queryPurchase(query); } },
  };
  const revenueSource = ts.transpileModule(awaitRevenueSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const revenueModule = { exports: {} };
  vm.runInNewContext(revenueSource, { module: revenueModule, exports: revenueModule.exports, require(name) {
    if (name === "server-only") return {};
    if (name === "@/lib/server/studio-ownership") return { getStoryOwner: async () => authorId ? { ownerId: authorId, authorId: 2 } : null };
    return require(name);
  } });
  const routeModule = { exports: {} };
  const context = {
    exports: routeModule.exports,
    module: routeModule,
    console: { error() {} },
    require(name) {
      if (name === "@/lib/prisma") return { prisma };
      if (name === "@/lib/server/chapter-revenue") return revenueModule.exports;
      if (name === "@/lib/server/auth-session") return {
        async requireUser() {
          return authorized
            ? { authorized: true, user: { idTaiKhoan: 7, roles } }
            : { authorized: false, response: NextResponse.json({ success: false }, { status: 401 }) };
        },
      };
      return require(name);
    },
  };
  vm.runInNewContext(compiledRoute, context, { filename: "chapter-purchase-route.cjs" });

  return {
    get state() { return state; },
    get walletLocks() { return walletLocks; },
    get transactionCount() { return transactionCount; },
    async purchase({ id = "11", body = { expectedPrice: price }, rawBody, headers = {} } = {}) {
      const request = new NextRequest(`https://webnovel.example/api/chapters/${id}/purchase`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "https://webnovel.example", ...headers },
        body: rawBody ?? JSON.stringify(body),
      });
      const response = await routeModule.exports.POST(request, { params: Promise.resolve({ id }) });
      return { status: response.status, body: await response.json() };
    },
  };
}

