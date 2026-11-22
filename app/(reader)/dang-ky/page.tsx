"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Loader2, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { safeAuthRedirect } from "@/lib/auth-redirect";
import PasswordStrengthInput from "@/components/auth/PasswordStrengthInput";

const oauthErrors: Record<string, string> = { account_locked: "Tài khoản của bạn đã bị khóa.", email_not_verified: "Email Google chưa được xác minh.", oauth_state_invalid: "Phiên đăng nhập Google không hợp lệ. Hãy thử lại.", oauth_unavailable: "Đăng nhập Google chưa được cấu hình.", oauth_failed: "Không thể đăng nhập bằng Google." };

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = safeAuthRedirect(searchParams.get("redirect"));

  const [form, setForm] = useState({
    tenTaiKhoan: "",
    email: "",
    matKhau: "",
    xacNhanMatKhau: "",
  });
  const [error, setError] = useState(() => oauthErrors[searchParams.get("error") ?? ""] ?? "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (form.matKhau !== form.xacNhanMatKhau) {
      setError("Mật khẩu xác nhận không khớp");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Đăng ký thất bại");
        toast.error(data.message || "Đăng ký thất bại");
        return;
      }

      toast.success("Đăng ký thành công! Vui lòng đăng nhập.");
      router.push(`/dang-nhap?redirect=${encodeURIComponent(redirectUrl)}`);
    } catch {
      setError("Không thể kết nối đến máy chủ, vui lòng thử lại");
      toast.error("Lỗi kết nối máy chủ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-xl shadow-slate-900/5 dark:shadow-black/20">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
            <BookOpen className="w-6 h-6" />
          </div>
        </Link>
        <h1 className="text-2xl font-black text-slate-800 dark:text-zinc-100 tracking-tight">
          Tạo Tài Khoản Mới
        </h1>
        <p className="text-xs text-slate-400 mt-1.5">
          Khám phá và lưu trữ hàng nghìn truyện chữ phong phú ngay hôm nay
        </p>
      </div>

      {/* Error alert */}
      {error && (
        <div className="mb-5 p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs rounded-xl font-medium flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
            Tên tài khoản (viết liền, không dấu)
          </label>
          <div className="relative">
            <input
              type="text"
              required
              value={form.tenTaiKhoan}
              onChange={(e) => setForm({ ...form, tenTaiKhoan: e.target.value })}
              placeholder="VD: nguyenvana"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 transition-all"
            />
            <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
            Email
          </label>
          <div className="relative">
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="VD: nguyenvana@example.com"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 transition-all"
            />
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          </div>
        </div>

        <PasswordStrengthInput password={form.matKhau} onPasswordChange={(matKhau) => setForm({ ...form, matKhau })} confirmPassword={form.xacNhanMatKhau} onConfirmPasswordChange={(xacNhanMatKhau) => setForm({ ...form, xacNhanMatKhau })} disabled={loading} />

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-sm rounded-xl transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 mt-6 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Đang đăng ký tài khoản...
            </>
          ) : (
            "Đăng Ký Tài Khoản"
          )}
        </button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-slate-400 before:h-px before:flex-1 before:bg-slate-200 after:h-px after:flex-1 after:bg-slate-200 dark:before:bg-zinc-800 dark:after:bg-zinc-800">hoặc</div>
      <a href={`/api/auth/google?redirect=${encodeURIComponent(redirectUrl)}`} className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"><GoogleLogo />Tiếp tục với Google</a>

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-slate-100 dark:border-zinc-800 text-center text-xs text-slate-400">
        Đã có tài khoản?{" "}
        <Link
          href={`/dang-nhap${redirectUrl !== "/" ? `?redirect=${encodeURIComponent(redirectUrl)}` : ""}`}
          className="text-blue-600 dark:text-blue-400 font-bold hover:underline"
        >
          Đăng nhập ngay
        </Link>
      </div>
    </div>
  );
}

function GoogleLogo() { return <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.35 12.27c0-.7-.06-1.37-.18-2H12v3.79h5.24a4.48 4.48 0 0 1-1.94 2.94v2.52h3.14c1.84-1.7 2.91-4.2 2.91-7.25Z"/><path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.23l-3.14-2.52c-.87.58-1.99.93-3.31.93-2.54 0-4.7-1.72-5.47-4.03H3.28v2.6A9.75 9.75 0 0 0 12 21.75Z"/><path fill="#FBBC05" d="M6.53 13.9A5.86 5.86 0 0 1 6.22 12c0-.66.11-1.29.31-1.9V7.5H3.28A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.06 1.03 4.5l3.25-2.6Z"/><path fill="#EA4335" d="M12 6.07c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.83 3.16 14.62 2.25 12 2.25A9.75 9.75 0 0 0 3.28 7.5l3.25 2.6C7.3 7.79 9.46 6.07 12 6.07Z"/></svg>; }

export default function RegisterPage() {
  return (
    <div className="flex min-h-[75vh] items-center justify-center py-10">
      <Suspense fallback={<div className="text-center text-sm text-slate-400">Đang tải...</div>}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
