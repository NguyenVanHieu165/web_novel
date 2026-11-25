import assert from "node:assert/strict";
import test from "node:test";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { loadNotificationModule } from "./notification-support.mjs";

const authSchema = loadNotificationModule("schemas/auth.schema.ts");
const { registerSchema } = authSchema;
const { readerPasswordSchema } = loadNotificationModule("schemas/reader-account.schema.ts", { "./auth.schema": authSchema });
const registration = password => ({ tenTaiKhoan: "reader", email: "reader@example.test", matKhau: password, xacNhanMatKhau: password });

test("registration and password changes share the72-byte UTF-8 boundary", () => {
  for (const password of ["Aa1" + "x".repeat(69), "Aa1" + "ế".repeat(23), "Aa1" + "🔒".repeat(17) + "x"]) {
    assert.equal(Buffer.byteLength(password, "utf8"), 72);
    assert.equal(registerSchema.safeParse(registration(password)).success, true);
    assert.equal(readerPasswordSchema.safeParse({ currentPassword: "PreviousPassword123", newPassword: password, confirmPassword: password }).success, true);
    for (const oversized of [password + "x", password + "🔒"]) {
      const result = registerSchema.safeParse(registration(oversized));
      assert.equal(result.success, false);
      assert.ok(result.error.issues.some(issue => issue.path[0] === "matKhau" && issue.message.includes("72 byte")));
      assert.equal(readerPasswordSchema.safeParse({ currentPassword: "PreviousPassword123", newPassword: oversized, confirmPassword: oversized }).success, false);
    }
  }
});

test("two accepted registration passwords cannot differ only beyond bcrypt's72-byte boundary", async () => {
  const prefix = "Aa1" + "x".repeat(69);
  const hash = await bcrypt.hash(prefix + "attackerSuffix", 4);
  assert.equal(await bcrypt.compare(prefix + "differentSuffix", hash), true, "demonstrate the bcrypt truncation being guarded");
  assert.equal(registerSchema.safeParse(registration(prefix + "attackerSuffix")).success, false);
  assert.equal(registerSchema.safeParse(registration(prefix + "differentSuffix")).success, false);
  assert.equal(registerSchema.safeParse(registration(prefix)).success, true);
});

test("registration rejects oversized UTF-8 passwords before hashing or account access", async () => {
  const POST = loadNotificationModule("app/api/auth/register/route.ts", {
    "@/schemas/auth.schema": authSchema,
    "@/lib/prisma": { prisma: new Proxy({}, { get() { assert.fail("Invalid input must not access accounts"); } }) },
    "@/lib/auth": { hashPassword() { assert.fail("Invalid input must not reach bcrypt"); } },
    "@/lib/server/account-roles": { resolveAccountRole() { assert.fail("Invalid input must not create roles"); } },
    "@/lib/server/rate-limit": { checkRateLimit: async () => ({ allowed: true }), requestIp: () => "test" },
  }).POST;
  const response = await POST(new NextRequest("https://example.test/api/auth/register", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(registration("Aa1" + "🔒".repeat(18))),
  }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).success, false);
});
