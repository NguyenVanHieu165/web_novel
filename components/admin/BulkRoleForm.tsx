"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { submitAccountForm } from "@/components/account/account-request";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetFooter } from "@/components/ui/sheet";
import { bulkRolesSchema, roleLabel, type RoleOption } from "@/schemas/admin-roles.schema";

type Values = z.infer<typeof bulkRolesSchema>;
const controlClass = "h-10 rounded-lg border border-border bg-background px-3 text-foreground focus-visible:ring-2 focus-visible:ring-ring";

export function BulkRoleForm({ accountIds, roles, onSaving, onSaved }: {
  accountIds: number[];
  roles: RoleOption[];
  onSaving: (value: boolean) => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(bulkRolesSchema),
    defaultValues: { accountIds, roleId: 0, operation: "grant" },
  });
  const { isSubmitting, errors } = form.formState;

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={form.handleSubmit(async (values) => {
      onSaving(true);
      form.clearErrors("root");
      try {
        const response = await submitAccountForm("/api/admin/users/roles/bulk", "PUT", values);
        if (!response.success) {
          form.setError("root", { message: response.message });
          toast.error(response.message);
          return;
        }
        toast.success(response.message);
        onSaved();
        router.refresh();
      } finally {
        onSaving(false);
      }
    })}>
      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
        <fieldset className="grid gap-4" disabled={isSubmitting || !roles.length}>
          <label className="grid gap-1.5 font-medium">
            Thao tác
            <select className={controlClass} {...form.register("operation")}>
              <option value="grant">Cấp vai trò</option>
              <option value="revoke">Thu hồi vai trò</option>
            </select>
          </label>
          <label className="grid gap-1.5 font-medium">
            Vai trò
            <select className={controlClass} {...form.register("roleId", { valueAsNumber: true })} required>
              <option value="">Chọn vai trò</option>
              {roles.map((role) => <option key={role.idVaiTro} value={role.idVaiTro}>{roleLabel(role.tenVaiTro)}</option>)}
            </select>
          </label>
        </fieldset>
        <p className="text-xs text-muted-foreground">
          {roles.length ? "Mỗi lần lưu sẽ cấp hoặc thu hồi một vai trò. Mỗi tài khoản cần giữ ít nhất một vai trò khi thu hồi." : "Chưa có vai trò để phân quyền."}
        </p>
        <div aria-live="polite">{errors.root ? <p className="text-sm text-red-700 dark:text-red-400">{errors.root.message}</p> : null}</div>
      </div>
      <SheetFooter className="flex-row justify-end border-t border-border px-5 py-4">
        <SheetClose asChild><Button type="button" variant="outline" disabled={isSubmitting} className="min-h-10">Hủy</Button></SheetClose>
        <Button type="submit" disabled={isSubmitting || !roles.length} className="min-h-10" aria-busy={isSubmitting}>
          {isSubmitting ? "Đang áp dụng…" : "Áp dụng thay đổi"}
        </Button>
      </SheetFooter>
    </form>
  );
}
