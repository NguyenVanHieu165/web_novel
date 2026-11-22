import assert from "node:assert/strict";
import test from "node:test";
import { harness } from "./chapter-purchase-support.mjs";

test("purchase atomically credits 70 percent to the registered author with paired ledger rows", async () => {
  const app = harness({ authorId: 20, authorBalance: 4, price: 10 });
  assert.equal((await app.purchase()).status, 200);
  assert.equal(app.state.wallets.get(7), 20);
  assert.equal(app.state.wallets.get(20), 11);
  assert.deepEqual(app.state.ledger.map(x => ({ ...x })), [
    { idTaiKhoan: 7, loai: "mua_chuong", id_doi_tuong: 11, so_xu_thay_doi: -10, soDuTruoc: 30, soDuSau: 20 },
    { idTaiKhoan: 20, loai: "mua_chuong", id_doi_tuong: 11, so_xu_thay_doi: 7, soDuTruoc: 4, soDuSau: 11 },
  ]);
  assert.deepEqual(app.walletLocks.slice(0, 2), [7, 20]);
});

test("revenue rounds down to whole coins and locks the lower author account first", async () => {
  const app = harness({ authorId: 3, price: 5 });
  assert.equal((await app.purchase()).status, 200);
  assert.equal(app.state.wallets.get(3), 3);
  assert.deepEqual(app.walletLocks.slice(0, 2), [3, 7]);
});

test("a repeat or concurrent purchase pays the author once", async () => {
  const app = harness({ authorId: 20 });
  const responses = await Promise.all([app.purchase(), app.purchase()]);
  assert.equal(responses.filter(x => x.body.alreadyUnlocked).length, 1);
  assert.equal(app.state.wallets.get(20), 7);
  assert.equal(app.state.ledger.length, 2);
  assert.equal(app.state.purchases.size, 1);
});

test("author ledger failure rolls back reader debit, entitlement and author balance", async () => {
  const app = harness({ authorId: 20, authorBalance: 4, failAuthorLedger: true });
  assert.equal((await app.purchase()).status, 500);
  assert.equal(app.state.wallets.get(7), 30);
  assert.equal(app.state.wallets.get(20), 4);
  assert.equal(app.state.purchases.size, 0);
  assert.equal(app.state.ledger.length, 0);
});

test("self-purchases and stories without a registered owner never produce author credits", async () => {
  for (const authorId of [7, null]) {
    const app = harness({ authorId });
    assert.equal((await app.purchase()).status, 200);
    assert.equal(app.state.wallets.get(7), 20);
    assert.equal(app.state.ledger.length, 1);
  }
});

test("insufficient balance never pays the author", async () => {
  const app = harness({ authorId: 20, authorBalance: 4, balance: 1 });
  assert.equal((await app.purchase()).status, 409);
  assert.equal(app.state.wallets.get(20), 4);
  assert.equal(app.state.ledger.length, 0);
});
