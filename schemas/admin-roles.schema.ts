import { z } from "zod";

export const roleIdSchema = z.number().int().positive().max(2_147_483_647);
export const accountIdParamSchema = z.string().regex(/^\d{1,10}$/).transform(Number).pipe(roleIdSchema);

const roleIdsSchema = z.array(roleIdSchema).max(100).refine(
  (ids) => new Set(ids).size === ids.length,
  "Mỗi vai trò chỉ được chọn một lần.",
);

export const assignRolesSchema = z.strictObject({
  expectedRoleIds: roleIdsSchema,
  roleIds: roleIdsSchema.refine((ids) => ids.length > 0, "Chọn ít nhất một vai trò."),
});

export const bulkRolesSchema = z.strictObject({
  accountIds: roleIdsSchema.refine((ids) => ids.length > 0 && ids.length <= 15),
  roleId: roleIdSchema,
  operation: z.enum(["grant", "revoke"]),
});

const permissionTabSchema = z.enum(["all", "admin", "author", "basic"]);
export type PermissionTab = z.infer<typeof permissionTabSchema>;

export const permissionsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: accountIdParamSchema.optional(),
  role: z.union([accountIdParamSchema, z.literal("").transform(() => undefined)]).optional(),
  tab: permissionTabSchema.optional(),
});

export type RoleOption = { idVaiTro: number; tenVaiTro: string; moTa: string | null };

export function roleLabel(name: string) {
  if (name === "admin") return "Quản trị viên";
  if (name === "user") return "Độc giả";
  if (name === "author") return "Tác giả";
  return name;
}
