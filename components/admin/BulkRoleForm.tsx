"use client";

import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { submitAccountForm } from "@/components/account/account-request";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormActions } from "@/components/shared/form-actions";
import { ErrorState, ErrorStateDescription, ErrorStateTitle } from "@/components/shared/error-state";
import { bulkRolesSchema, roleLabel, type RoleOption } from "@/schemas/admin-roles.schema";

type Values = z.infer<typeof bulkRolesSchema>;

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
            <Controller control={form.control} name="operation" render={({ field }) => <Select value={field.value} onValueChange={field.onChange} disabled={field.disabled}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="grant">Cấp vai trò</SelectItem><SelectItem value="revoke">Thu hồi vai trò</SelectItem></SelectContent></Select>} />
          </label>
          <label className="grid gap-1.5 font-medium">
            Vai trò
            <Controller control={form.control} name="roleId" render={({ field }) => <Select value={field.value ? String(field.value) : undefined} onValueChange={(value) => field.onChange(Number(value))} disabled={field.disabled}><SelectTrigger className="w-full"><SelectValue placeholder="Chọn vai trò" /></SelectTrigger><SelectContent>{roles.map((role) => <SelectItem key={role.idVaiTro} value={String(role.idVaiTro)}>{roleLabel(role.tenVaiTro)}</SelectItem>)}</SelectContent></Select>} />
          </label>
        </fieldset>
        <p className="text-xs text-muted-foreground">
          {roles.length ? "Mỗi lần lưu sẽ cấp hoặc thu hồi một vai trò. Mỗi tài khoản cần giữ ít nhất một vai trò khi thu hồi." : "Chưa có vai trò để phân quyền."}
        </p>
        <div aria-live="polite">{errors.root ? <ErrorState><ErrorStateTitle>Không thể cập nhật vai trò</ErrorStateTitle><ErrorStateDescription>{errors.root.message}</ErrorStateDescription></ErrorState> : null}</div>
      </div>
      <FormActions className="px-5 pb-4">
        <SheetClose asChild><Button type="button" variant="outline" disabled={isSubmitting} className="min-h-10">Hủy</Button></SheetClose>
        <Button type="submit" disabled={isSubmitting || !roles.length} className="min-h-10" aria-busy={isSubmitting}>
          {isSubmitting ? "Đang áp dụng…" : "Áp dụng thay đổi"}
        </Button>
      </FormActions>
    </form>
  );
}
