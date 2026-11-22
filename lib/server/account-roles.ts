import "server-only";
import type { Prisma } from "@/app/generated/prisma/client";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import type { z } from "zod";
import type { bulkRolesSchema } from "@/schemas/admin-roles.schema";

export class AccountRoleError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409) {
    super(message);
  }
}

export const visibleAccounts = { OR: [{ isDeleted: false }, { isDeleted: null }] } satisfies Prisma.TaiKhoanWhereInput;

export function isSameOriginAccountWrite(request: NextRequest) {
  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  const expectedOrigin = host ? `${request.nextUrl.protocol}//${host.toLowerCase()}` : request.nextUrl.origin;
  return request.headers.get("sec-fetch-site") !== "cross-site" && (origin === null || origin === expectedOrigin);
}

export function listAccountRoles() {
  return prisma.vaiTro.findMany({
    select: { idVaiTro: true, tenVaiTro: true, moTa: true },
    orderBy: [{ tenVaiTro: "asc" }, { idVaiTro: "asc" }],
  });
}

export async function resolveAccountRole(tx: Prisma.TransactionClient, roleId?: number) {
  if (roleId !== undefined) {
    const role = await tx.vaiTro.findUnique({ where: { idVaiTro: roleId }, select: { idVaiTro: true, tenVaiTro: true } });
    if (!role) throw new AccountRoleError("Vai trò đã chọn không tồn tại.", 400);
    return role;
  }

  const existing = await tx.vaiTro.findFirst({
    where: { tenVaiTro: "user" },
    orderBy: { idVaiTro: "asc" },
    select: { idVaiTro: true, tenVaiTro: true },
  });
  if (existing) return existing;

  // Keep bootstrap compatible with databases where the default role has not been seeded.
  const roles = await tx.$queryRaw<Array<{ idVaiTro: number; tenVaiTro: string }>>`
    SELECT idVAI_TRO AS idVaiTro, ten_vai_tro AS tenVaiTro
    FROM vai_tro ORDER BY idVAI_TRO FOR UPDATE
  `;
  return roles.find((role) => role.tenVaiTro === "user") ?? tx.vaiTro.create({
    data: { tenVaiTro: "user", moTa: "Độc giả tiêu chuẩn" },
    select: { idVaiTro: true, tenVaiTro: true },
  });
}

export async function lockActiveAdministrator(tx: Prisma.TransactionClient, actorId: number) {
  // Serialize role, account status and deletion writes on the same administrator role rows.
  const roles = await tx.$queryRaw<Array<{ idVaiTro: number }>>`
    SELECT idVAI_TRO AS idVaiTro FROM vai_tro
    WHERE BINARY ten_vai_tro = 'admin' ORDER BY idVAI_TRO FOR UPDATE
  `;
  const adminRoleIds = roles.map(({ idVaiTro }) => idVaiTro);
  const actor = await tx.taiKhoan.findFirst({
    where: {
      ...visibleAccounts,
      idTaiKhoan: actorId,
      trangThai: "active",
      vaiTroNguoiDung: { some: { idVaiTro: { in: adminRoleIds } } },
    },
    select: { idTaiKhoan: true },
  });
  if (!actor) throw new AccountRoleError("Bạn không còn quyền quản trị.", 403);
  return adminRoleIds;
}

export async function getRoleTarget(tx: Prisma.TransactionClient, idTaiKhoan: number) {
  const target = await tx.taiKhoan.findFirst({
    where: { ...visibleAccounts, idTaiKhoan },
    select: { trangThai: true, vaiTroNguoiDung: { select: { idVaiTro: true } } },
  });
  if (!target) throw new AccountRoleError("Không tìm thấy tài khoản.", 404);
  return { trangThai: target.trangThai, roleIds: target.vaiTroNguoiDung.map(({ idVaiTro }) => idVaiTro) };
}

export async function protectActiveAdministrator(
  tx: Prisma.TransactionClient,
  actorId: number,
  targetId: number,
  target: Awaited<ReturnType<typeof getRoleTarget>>,
  adminRoleIds: number[],
) {
  if (actorId === targetId) {
    throw new AccountRoleError("Bạn không thể tự thu hồi quyền, khóa hoặc xóa tài khoản đang dùng.", 409);
  }
  if (target.trangThai !== "active" || !target.roleIds.some((id) => adminRoleIds.includes(id))) return;

  const anotherAdmin = await tx.taiKhoan.findFirst({
    where: {
      ...visibleAccounts,
      idTaiKhoan: { not: targetId },
      trangThai: "active",
      vaiTroNguoiDung: { some: { idVaiTro: { in: adminRoleIds } } },
    },
    select: { idTaiKhoan: true },
  });
  if (!anotherAdmin) throw new AccountRoleError("Hệ thống cần ít nhất một quản trị viên hoạt động.", 409);
}

async function saveAccountRoles(
  tx: Prisma.TransactionClient,
  actorId: number,
  targetId: number,
  target: Awaited<ReturnType<typeof getRoleTarget>>,
  adminRoleIds: number[],
  roleIds: number[],
) {
  const losingAdmin = target.roleIds.some((id) => adminRoleIds.includes(id)) &&
    !roleIds.some((id) => adminRoleIds.includes(id));
  if (losingAdmin) await protectActiveAdministrator(tx, actorId, targetId, target, adminRoleIds);
  const gainingAdmin = roleIds.some((id) => adminRoleIds.includes(id)) &&
    !target.roleIds.some((id) => adminRoleIds.includes(id));
  const defaultPassword = process.env.ADMIN_IMPORTED_USER_PASSWORD;
  if (gainingAdmin && defaultPassword) {
    const account = await tx.taiKhoan.findUnique({ where: { idTaiKhoan: targetId }, select: { matKhau: true } });
    if (account && await verifyPassword(defaultPassword, account.matKhau)) {
      throw new AccountRoleError("Tài khoản cần đổi mật khẩu mặc định trước khi được cấp quyền quản trị.", 409);
    }
  }

  const removed = target.roleIds.filter((id) => !roleIds.includes(id));
  const added = roleIds.filter((id) => !target.roleIds.includes(id));
  if (removed.length) {
    await tx.vaiTroNguoiDung.deleteMany({ where: { idTaiKhoan: targetId, idVaiTro: { in: removed } } });
  }
  if (added.length) {
    await tx.vaiTroNguoiDung.createMany({ data: added.map((idVaiTro) => ({ idTaiKhoan: targetId, idVaiTro })) });
  }
}

export function updateAccountRoles(actorId: number, targetId: number, expectedRoleIds: number[], roleIds: number[]) {
  return prisma.$transaction(async (tx) => {
    const adminRoleIds = await lockActiveAdministrator(tx, actorId);
    const target = await getRoleTarget(tx, targetId);
    if (target.roleIds.length !== expectedRoleIds.length ||
      target.roleIds.some((id) => !expectedRoleIds.includes(id))) {
      throw new AccountRoleError("Vai trò đã thay đổi. Tải lại trang trước khi lưu.", 409);
    }
    const valid = await tx.vaiTro.count({ where: { idVaiTro: { in: roleIds } } });
    if (valid !== roleIds.length) throw new AccountRoleError("Một hoặc nhiều vai trò không còn tồn tại.", 400);
    await saveAccountRoles(tx, actorId, targetId, target, adminRoleIds, roleIds);
  }, { isolationLevel: "ReadCommitted" });
}

export function updateAccountRolesInBulk(actorId: number, { accountIds, roleId, operation }: z.infer<typeof bulkRolesSchema>) {
  return prisma.$transaction(async (tx) => {
    const adminRoleIds = await lockActiveAdministrator(tx, actorId);
    if (operation === "revoke" && adminRoleIds.includes(roleId) && accountIds.includes(actorId)) {
      throw new AccountRoleError("Bạn không thể tự thu hồi quyền quản trị viên.", 409);
    }
    await resolveAccountRole(tx, roleId);
    const accounts = await tx.taiKhoan.findMany({
      where: { ...visibleAccounts, idTaiKhoan: { in: accountIds } },
      select: { idTaiKhoan: true, trangThai: true, vaiTroNguoiDung: { select: { idVaiTro: true } } },
    });
    if (accounts.length !== accountIds.length) throw new AccountRoleError("Một tài khoản không còn tồn tại. Hãy tải lại trang.", 404);

    const changes = accounts.flatMap(({ idTaiKhoan, trangThai, vaiTroNguoiDung }) => {
      const current = vaiTroNguoiDung.map(({ idVaiTro }) => idVaiTro);
      const hasRole = current.includes(roleId);
      if (hasRole === (operation === "grant")) return [];
      const next = operation === "grant" ? [...current, roleId] : current.filter((id) => id !== roleId);
      if (!next.length) throw new AccountRoleError("Mỗi tài khoản cần ít nhất một vai trò. Cấp vai trò khác trước khi thu hồi.", 409);
      return [{ idTaiKhoan, target: { trangThai, roleIds: current }, next }];
    });

    for (const { idTaiKhoan, target, next } of changes) {
      await saveAccountRoles(tx, actorId, idTaiKhoan, target, adminRoleIds, next);
    }
    return changes.length;
  }, { isolationLevel: "ReadCommitted", timeout: 20_000 });
}
