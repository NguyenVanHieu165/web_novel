"use client";

import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SheetClose, SheetFooter } from "@/components/ui/sheet";
import { submitAccountForm } from "@/components/account/account-request";
import { assignRolesSchema, roleLabel, type RoleOption } from "@/schemas/admin-roles.schema";

type Values = z.infer<typeof assignRolesSchema>;

const descriptions: Record<string, string> = {
  admin: "Truy cập khu vực quản trị, quản lý nội dung và phân quyền tài khoản.",
  author: "Vai trò tác giả. Tính năng tự đăng và quản lý truyện chưa được triển khai.",
  user: "Đọc truyện, bình luận, đánh giá và sử dụng ví xu.",
};

export default function RoleAssignmentForm({ accountId, roleIds, roles, onSaving, onSaved }: {
  accountId: number;
  roleIds: number[];
  roles: RoleOption[];
  onSaving: (value: boolean) => void;
  onSaved: () => void;
}) {
  const router = useRouter();
  const form = useForm<Values>({
    resolver: zodResolver(assignRolesSchema),
    defaultValues: { expectedRoleIds: roleIds, roleIds },
  });
  const { control, formState: { errors, isSubmitting, isDirty } } = form;

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={form.handleSubmit(async (values) => {
      onSaving(true);
      try {
        const response = await submitAccountForm(`/api/admin/users/${accountId}/roles`, "PUT", values);
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
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <fieldset className="grid gap-2" disabled={isSubmitting}>
          <legend className="mb-3 font-semibold">Vai trò</legend>
          <Controller control={control} name="roleIds" render={({ field }) => (
            <>
              {roles.map((role, index) => {
                const checked = field.value.includes(role.idVaiTro);
                const description = descriptions[role.tenVaiTro] ?? role.moTa;
                return (
                  <label key={role.idVaiTro} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:bg-muted/60 has-checked:border-primary/50 has-checked:bg-primary/5">
                    <input type="checkbox" name={field.name} checked={checked}
                      className="mt-0.5 size-4 shrink-0 rounded accent-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      ref={index === 0 ? field.ref : undefined} onBlur={field.onBlur}
                      onChange={(event) => field.onChange(event.target.checked
                        ? [...field.value, role.idVaiTro] : field.value.filter((id) => id !== role.idVaiTro))}
                      aria-invalid={Boolean(errors.roleIds)}
                      aria-describedby={errors.roleIds ? "assignment-role-error" : undefined}
                    />
                    <span className="min-w-0 wrap-break-word">
                      <span className="block font-medium">{roleLabel(role.tenVaiTro)}</span>
                      {description ? <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{description}</span> : null}
                    </span>
                  </label>
                );
              })}
            </>
          )} />
        </fieldset>
        <div aria-live="polite">
          {(errors.roleIds || errors.root) ? (
            <p id="assignment-role-error" className="mt-3 text-sm text-red-700 dark:text-red-400">
              {errors.roleIds?.message ?? errors.root?.message}
            </p>
          ) : null}
        </div>
      </div>
      <SheetFooter className="flex-row justify-end border-t border-border px-5 py-4">
        <SheetClose asChild><Button type="button" variant="outline" disabled={isSubmitting} className="min-h-10">Hủy</Button></SheetClose>
        <Button type="submit" disabled={!isDirty || isSubmitting} className="min-h-10" aria-busy={isSubmitting}>
          {isSubmitting ? "Đang lưu…" : "Lưu thay đổi"}
        </Button>
      </SheetFooter>
    </form>
  );
}
