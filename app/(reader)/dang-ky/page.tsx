"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Loader2, Lock, Mail, User, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { safeAuthRedirect } from "@/lib/auth-redirect";

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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
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

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
            Mật khẩu (tối thiểu 6 ký tự)
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              value={form.matKhau}
              onChange={(e) => setForm({ ...form, matKhau: e.target.value })}
              placeholder="••••••••"
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 transition-all"
            />
            <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-zinc-400 mb-1.5">
            Xác nhận lại mật khẩu
          </label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              value={form.xacNhanMatKhau}
              onChange={(e) => setForm({ ...form, xacNhanMatKhau: e.target.value })}
              placeholder="••••••••"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 transition-all"
            />
            <CheckCircle2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          </div>
        </div>

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

export default function RegisterPage() {
  return (
    <div className="flex min-h-[75vh] items-center justify-center py-10">
      <Suspense fallback={<div className="text-center text-sm text-slate-400">Đang tải...</div>}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
