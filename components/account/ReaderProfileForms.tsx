"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { readerPasswordSchema, readerProfileSchema, type ReaderPasswordInput, type ReaderProfileInput } from "@/schemas/reader-account.schema";
import { AccountField, AccountFormStatus } from "./AccountField";
import { submitAccountForm } from "./account-request";
import ReaderAvatar from "./ReaderAvatar";

export function ProfileForm({ initial }: { initial: ReaderProfileInput }) {
  const { refreshUser } = useAuth();
  const [savedProfile, setSavedProfile] = useState(initial);
  const [message, setMessage] = useState("");
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } =
    useForm<ReaderProfileInput>({ resolver: zodResolver(readerProfileSchema), defaultValues: initial });

  return (
    <form noValidate className="space-y-5" onSubmit={handleSubmit(async (values) => {
      setMessage("");
      const result = await submitAccountForm("/api/profile", "PUT", values);
      if (!result.success) {
        if (result.field === "displayName" || result.field === "avatar") {
          setError(result.field, { message: result.message }, { shouldFocus: true });
        } else setError("root", { message: result.message });
        return;
      }
      setSavedProfile(values);
      reset(values);
      setMessage(result.message);
      await refreshUser();
    }, () => setMessage(""))}>
      <fieldset className="space-y-5">
        <ReaderAvatar url={savedProfile.avatar} name={savedProfile.displayName} size={64} />
        <AccountField {...register("displayName")} id="display-name" label="Tên hiển thị" autoComplete="nickname"
          maxLength={255} required readOnly={isSubmitting} error={errors.displayName?.message} />
        <AccountField {...register("avatar")} id="avatar-url" type="url" label="Đường dẫn ảnh đại diện"
          autoComplete="off" spellCheck={false} maxLength={500} hint="Dùng đường dẫn HTTPS. Để trống để bỏ ảnh."
          readOnly={isSubmitting} error={errors.avatar?.message} />
      </fieldset>
      <Button type="submit" disabled={isSubmitting}
        className="min-h-11 w-full bg-blue-700 text-white transition-colors hover:bg-blue-800 sm:w-auto">
        {isSubmitting ? "Đang lưu…" : "Lưu hồ sơ"}
      </Button>
      <AccountFormStatus error={errors.root?.message} message={message} />
    </form>
  );
}

const passwordDefaults: ReaderPasswordInput = { currentPassword: "", newPassword: "", confirmPassword: "" };

export function PasswordForm() {
  const [message, setMessage] = useState("");
  const { register, handleSubmit, setError, reset, formState: { errors, isSubmitting } } =
    useForm<ReaderPasswordInput>({ resolver: zodResolver(readerPasswordSchema), defaultValues: passwordDefaults });

  return (
    <form noValidate className="space-y-5" onSubmit={handleSubmit(async (values) => {
      setMessage("");
      const result = await submitAccountForm("/api/profile/password", "PUT", values);
      if (!result.success) {
        const { field } = result;
        if (field === "currentPassword" || field === "newPassword" || field === "confirmPassword") {
          setError(field, { message: result.message }, { shouldFocus: true });
        } else setError("root", { message: result.message });
        return;
      }
      reset(passwordDefaults);
      setMessage(result.message);
    }, () => setMessage(""))}>
      <fieldset className="space-y-5">
        <AccountField {...register("currentPassword")} id="current-password" type="password" label="Mật khẩu hiện tại"
          autoComplete="current-password" maxLength={1024} required readOnly={isSubmitting} error={errors.currentPassword?.message} />
        <AccountField {...register("newPassword")} id="new-password" type="password" label="Mật khẩu mới"
          autoComplete="new-password" maxLength={50} required readOnly={isSubmitting} hint="Dùng từ 6 đến 50 ký tự, tối đa 72 byte." error={errors.newPassword?.message} />
        <AccountField {...register("confirmPassword")} id="confirm-password" type="password" label="Xác nhận mật khẩu mới"
          autoComplete="new-password" maxLength={50} required readOnly={isSubmitting} error={errors.confirmPassword?.message} />
      </fieldset>
      <Button type="submit" disabled={isSubmitting}
        className="min-h-11 w-full bg-blue-700 text-white transition-colors hover:bg-blue-800 sm:w-auto">
        {isSubmitting ? "Đang đổi…" : "Đổi mật khẩu"}
      </Button>
      <AccountFormStatus error={errors.root?.message} message={message} />
    </form>
  );
}
