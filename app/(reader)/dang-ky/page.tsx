"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Loader2, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { safeAuthRedirect } from "@/lib/auth-redirect";
import PasswordStrengthInput from "@/components/auth/PasswordStrengthInput";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormActions } from "@/components/shared/form-actions";

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
    <Card className="w-full max-w-md rounded-3xl py-0 shadow-xl">
      {/* Brand Header */}
      <CardHeader className="items-center px-8 pb-0 pt-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2 mb-4 group">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/25 group-hover:scale-105 transition-transform">
            <BookOpen className="w-6 h-6" />
          </div>
        </Link>
        <CardTitle className="text-2xl font-black tracking-tight">
          Tạo Tài Khoản Mới
        </CardTitle>
        <CardDescription className="mt-1.5 text-xs">
          Khám phá và lưu trữ hàng nghìn truyện chữ phong phú ngay hôm nay
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 px-8 pb-8">

      {/* Error alert */}
      {error && (
        <Alert variant="destructive" aria-live="polite"><AlertDescription>{error}</AlertDescription></Alert>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="register-username" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Tên tài khoản (viết liền, không dấu)
          </Label>
          <div className="relative">
            <Input
              id="register-username"
              name="username"
              type="text"
              required
              autoComplete="username"
              spellCheck={false}
              value={form.tenTaiKhoan}
              onChange={(e) => setForm({ ...form, tenTaiKhoan: e.target.value })}
              placeholder="VD: nguyenvana…"
              className="h-11 rounded-xl bg-muted/40 pl-10"
            />
            <User aria-hidden="true" className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
          </div>
        </div>

        <div>
          <Label htmlFor="register-email" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Email
          </Label>
          <div className="relative">
            <Input
              id="register-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              spellCheck={false}
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="VD: nguyenvana@example.com…"
              className="h-11 rounded-xl bg-muted/40 pl-10"
            />
            <Mail aria-hidden="true" className="absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
          </div>
        </div>

        <PasswordStrengthInput password={form.matKhau} onPasswordChange={(matKhau) => setForm({ ...form, matKhau })} confirmPassword={form.xacNhanMatKhau} onConfirmPasswordChange={(xacNhanMatKhau) => setForm({ ...form, xacNhanMatKhau })} disabled={loading} />

        <FormActions className="border-0 pt-2">
          <Button type="submit" size="lg" disabled={loading} className="w-full rounded-xl font-bold">
            {loading ? <><Loader2 aria-hidden="true" className="animate-spin" />Đang đăng ký tài khoản…</> : "Đăng Ký Tài Khoản"}
          </Button>
        </FormActions>
      </form>
      <div className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">hoặc</div>
      <Button asChild variant="outline" className="w-full rounded-xl"><a href={`/api/auth/google?redirect=${encodeURIComponent(redirectUrl)}`}><GoogleLogo />Tiếp tục với Google</a></Button>

      {/* Footer */}
      <div className="border-t pt-6 text-center text-xs text-muted-foreground">
        Đã có tài khoản?{" "}
        <Link
          href={`/dang-nhap${redirectUrl !== "/" ? `?redirect=${encodeURIComponent(redirectUrl)}` : ""}`}
          className="font-bold text-primary hover:underline"
        >
          Đăng nhập ngay
        </Link>
      </div>
      </CardContent>
    </Card>
  );
}

function GoogleLogo() { return <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.35 12.27c0-.7-.06-1.37-.18-2H12v3.79h5.24a4.48 4.48 0 0 1-1.94 2.94v2.52h3.14c1.84-1.7 2.91-4.2 2.91-7.25Z"/><path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.23l-3.14-2.52c-.87.58-1.99.93-3.31.93-2.54 0-4.7-1.72-5.47-4.03H3.28v2.6A9.75 9.75 0 0 0 12 21.75Z"/><path fill="#FBBC05" d="M6.53 13.9A5.86 5.86 0 0 1 6.22 12c0-.66.11-1.29.31-1.9V7.5H3.28A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.06 1.03 4.5l3.25-2.6Z"/><path fill="#EA4335" d="M12 6.07c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.83 3.16 14.62 2.25 12 2.25A9.75 9.75 0 0 0 3.28 7.5l3.25 2.6C7.3 7.79 9.46 6.07 12 6.07Z"/></svg>; }

export default function RegisterPage() {
  return (
    <div className="flex min-h-[75vh] items-center justify-center py-10">
      <Suspense fallback={<div role="status" className="text-center text-sm text-muted-foreground">Đang tải…</div>}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
