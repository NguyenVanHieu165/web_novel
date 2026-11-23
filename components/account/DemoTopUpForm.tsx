"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { demoCoinPackages, demoTopUpRequestSchema, type DemoTopUpInput } from "@/schemas/reader-wallet.schema";
import { AccountFormStatus } from "./AccountField";
import { submitAccountForm } from "./account-request";
import { FormActions } from "@/components/shared/form-actions";

export default function DemoTopUpForm() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [message, setMessage] = useState("");
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<DemoTopUpInput>({
    resolver: zodResolver(demoTopUpRequestSchema),
    defaultValues: { packageId: "small" },
  });

  return (
    <form className="space-y-4" onSubmit={handleSubmit(async (values) => {
      setMessage("");
      const result = await submitAccountForm("/api/wallet/top-up", "POST", values);
      if (!result.success) {
        setError("root", { message: result.message });
        return;
      }
      setMessage(result.message);
      router.refresh();
      await refreshUser();
    }, () => setMessage(""))}>
      <fieldset disabled={isSubmitting} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Chọn gói xu</legend>
        {Object.entries(demoCoinPackages).map(([id, amount]) => (
          <label key={id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted has-checked:border-primary has-checked:bg-primary/10">
            <input type="radio" value={id} {...register("packageId")}
              className="size-4 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
            <span className="font-semibold tabular-nums">{amount} xu</span>
          </label>
        ))}
      </fieldset>
      <FormActions>
        <Button type="submit" disabled={isSubmitting} className="min-h-11 w-full sm:w-auto">
          {isSubmitting ? "Đang nạp…" : "Nạp xu mô phỏng"}
        </Button>
      </FormActions>
      <AccountFormStatus error={errors.root?.message ?? errors.packageId?.message} message={message} />
    </form>
  );
}
