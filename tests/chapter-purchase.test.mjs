import assert from "node:assert/strict";
import test from "node:test";
import { harness } from "./chapter-purchase-support.mjs";

test("requires an authenticated account before any wallet transaction", async () => {
  const app = harness({ authorized: false });
  assert.equal((await app.purchase()).status, 401);
  assert.equal(app.transactionCount, 0);
  assert.equal(app.state.wallets.get(7), 30);
});

test("admins with existing reading access cannot be charged", async () => {
  const app = harness({ roles: ["admin"] });
  assert.equal((await app.purchase()).status, 403);
  assert.equal(app.transactionCount, 0);
});

test("rejects cross-origin and cross-site requests before any transaction", async () => {
  const app = harness();
  assert.equal((await app.purchase({ headers: { origin: "https://untrusted.example" } })).status, 403);
  assert.equal((await app.purchase({ headers: { "sec-fetch-site": "cross-site" } })).status, 403);
  assert.equal(app.transactionCount, 0);
});

test("rejects invalid chapter identifiers and malformed confirmation bodies", async () => {
  const app = harness();
  for (const id of ["invalid", "0", "-1", "1.5"]) {
    assert.equal((await app.purchase({ id })).status, 400, id);
  }
  for (const body of [{}, null, { expectedPrice: -1 }, { expectedPrice: 1.5 }, { expectedPrice: "10" }]) {
    assert.equal((await app.purchase({ body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await app.purchase({ rawBody: "{" })).status, 400);
  assert.equal(app.transactionCount, 0);
});

test("rejects client-supplied account and balance fields", async () => {
  const app = harness();
  for (const extra of [{ userId: 99 }, { idTaiKhoan: 99 }, { balance: 100000 }, { price: 1 }]) {
    assert.equal((await app.purchase({ body: { expectedPrice: 10, ...extra } })).status, 400);
  }
  assert.equal(app.transactionCount, 0);
  assert.equal(app.state.wallets.get(99), 1000);
});

test("a changed or tampered price requires confirmation again without charging", async () => {
  const app = harness({ price: 15 });
  const response = await app.purchase({ body: { expectedPrice: 10 } });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "PRICE_CHANGED");
  assert.equal(response.body.price, 15);
  assert.equal(app.state.wallets.get(7), 30);
  assert.equal(app.state.purchases.size, 0);
  assert.equal(app.state.ledger.length, 0);
});

test("an unavailable chapter or deleted parent result never creates a purchase", async () => {
  const app = harness({ available: false });
  assert.equal((await app.purchase()).status, 404);
  assert.equal(app.state.wallets.get(7), 30);
  assert.equal(app.state.purchases.size, 0);
  assert.equal(app.state.ledger.length, 0);
});

test("free chapters and invalid stored prices never consume coins", async () => {
  const freeChapter = harness({ free: true });
  assert.equal((await freeChapter.purchase()).status, 409);
  assert.equal(freeChapter.state.wallets.get(7), 30);

  const invalidPrice = harness({ price: 0 });
  assert.equal((await invalidPrice.purchase({ body: { expectedPrice: 10 } })).status, 409);
  assert.equal(invalidPrice.state.wallets.get(7), 30);
  assert.equal(invalidPrice.state.ledger.length, 0);
});

test("a chapter without available content cannot consume coins", async () => {
  for (const contentReady of [0, 0n]) {
    const app = harness({ contentReady });
    const response = await app.purchase();
    assert.equal(response.status, 409);
    assert.equal(response.body.success, false);
    assert.equal(app.state.wallets.get(7), 30);
    assert.equal(app.state.purchases.size, 0);
    assert.equal(app.state.ledger.length, 0);
  }
});

test("insufficient balance and missing wallet leave purchase and ledger untouched", async () => {
  for (const app of [harness({ balance: 9 }), harness({ missingWallet: true })]) {
    const response = await app.purchase();
    assert.equal(response.status, 409);
    assert.equal(response.body.success, false);
    assert.equal(app.state.purchases.size, 0);
    assert.equal(app.state.ledger.length, 0);
  }
});

test("successful purchase debits the authenticated wallet and writes an auditable ledger entry", async () => {
  const app = harness({ bigintResults: true });
  const response = await app.purchase();
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.balance, 20);
  assert.equal(app.state.wallets.get(7), 20);
  assert.equal(app.state.wallets.get(99), 1000);
  assert.ok(app.state.purchases.has("7:11"));
  assert.deepEqual(app.state.ledger, [{
    idTaiKhoan: 7,
    loai: "mua_chuong",
    id_doi_tuong: 11,
    so_xu_thay_doi: -10,
    soDuTruoc: 30,
    soDuSau: 20,
  }]);
});

test("repeating an already completed purchase does not charge again", async () => {
  const app = harness({ balance: 10 });
  assert.equal((await app.purchase()).status, 200);
  const repeat = await app.purchase({ body: { expectedPrice: 15 } });
  assert.equal(repeat.status, 200);
  assert.equal(repeat.body.alreadyUnlocked, true);
  assert.equal(app.state.wallets.get(7), 0);
  assert.equal(app.state.purchases.size, 1);
  assert.equal(app.state.ledger.length, 1);
});

test("ledger failure rolls back both balance and chapter ownership", async () => {
  const app = harness({ failLedger: true });
  const response = await app.purchase();
  assert.equal(response.status, 500);
  assert.equal(app.state.wallets.get(7), 30);
  assert.equal(app.state.purchases.size, 0);
  assert.equal(app.state.ledger.length, 0);
  assert.doesNotMatch(JSON.stringify(response.body), /Simulated ledger failure/);
});

test("parallel calls for the same chapter remain idempotent with serialized transactions", async () => {
  const app = harness();
  const responses = await Promise.all([app.purchase(), app.purchase()]);
  assert.deepEqual(responses.map(({ status }) => status), [200, 200]);
  assert.equal(app.state.wallets.get(7), 20);
  assert.equal(app.state.purchases.size, 1);
  assert.equal(app.state.ledger.length, 1);
});

test("parallel purchases cannot overspend the same wallet with serialized transactions", async () => {
  const app = harness({ balance: 15 });
  const responses = await Promise.all([app.purchase(), app.purchase({ id: "12" })]);
  assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 409]);
  assert.equal(app.state.wallets.get(7), 5);
  assert.equal(app.state.purchases.size, 1);
  assert.equal(app.state.ledger.length, 1);
});
