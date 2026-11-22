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
          <label key={id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border
            border-slate-300 px-3 py-2 text-sm hover:bg-slate-50 has-checked:border-blue-600 has-checked:bg-blue-50
            dark:border-zinc-700 dark:hover:bg-zinc-800 dark:has-checked:border-blue-400 dark:has-checked:bg-blue-950/50">
            <input type="radio" value={id} {...register("packageId")}
              className="size-4 accent-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" />
            <span className="font-semibold tabular-nums">{amount} xu</span>
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={isSubmitting}
        className="min-h-11 w-full bg-blue-700 text-white transition-colors hover:bg-blue-800 sm:w-auto">
        {isSubmitting ? "Đang nạp…" : "Nạp xu mô phỏng"}
      </Button>
      <AccountFormStatus error={errors.root?.message ?? errors.packageId?.message} message={message} />
    </form>
  );
}
